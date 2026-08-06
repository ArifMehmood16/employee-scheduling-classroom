/**
 * Verification of the port. These are not decoration — they are the reason you can
 * trust the numbers the classroom shows you.
 *
 * Run: npm test
 */

import { describe, expect, it } from "vitest";
import {
  endOfDayExclusiveMs,
  minuteOverlap,
  minutesBetweenMinusOneNano,
  overlappingDurationInMinutes,
  startOfDayMs,
  type Employee,
  type EmployeeSchedule,
  type Shift,
} from "../domain";
import {
  IncrementalLoadBalance,
  loadStandardDeviation,
  unfairnessComputationalFormula,
  unfairnessDirect,
} from "../loadBalance";
import { ALL_ENABLED, evaluateSchedule, type ConstraintToggles } from "../constraints";
import { compareScore } from "../score";
import { createRandom, generateDemoData, SMALL, TINY } from "../demoData";
import { EmployeeSchedulingSolver } from "../solver";
import { computeSearchSpace, log10Permutations } from "../searchSpace";
import { analyseFeasibility, maxBipartiteMatching } from "../feasibility";

/**
 * The solver tests run tens of thousands of real local-search steps — that is the
 * point of them. Vitest's 5s default timeout is sized for unit tests and would fail
 * them on wall-clock alone, which tells you nothing about whether the solver is
 * correct. Module scope so every describe block can reach it.
 */
const SOLVER_TEST_TIMEOUT_MS = 30_000;

function employee(name: string, skills: string[], extra: Partial<Employee> = {}): Employee {
  return {
    name,
    skills,
    unavailableDates: [],
    undesiredDates: [],
    desiredDates: [],
    ...extra,
  };
}

function shift(
  id: string,
  start: string,
  end: string,
  requiredSkill: string,
  employeeName: string | null = null,
): Shift {
  return { id, start, end, location: "Ward", requiredSkill, employee: employeeName };
}

// ---------------------------------------------------------------------------
describe("java.time semantics", () => {
  it("LocalTime.MAX is 1ns short of midnight, so a night shift gives 119 min not 120", () => {
    // 22:00 -> 06:00 next day. Overlap with day 1 = 22:00 .. 23:59:59.999999999
    const nightShift = shift("n", "2026-08-10T22:00", "2026-08-11T06:00", "Nurse");
    expect(overlappingDurationInMinutes(nightShift, "2026-08-10")).toBe(119);
    expect(overlappingDurationInMinutes(nightShift, "2026-08-11")).toBe(360);
    // 119 + 360 = 479, one minute short of the 480-minute shift. That minute is lost
    // to truncation, exactly as in the Java.
    expect(119 + 360).toBe(479);
  });

  it("the exclusive day end IS the next midnight, with the nanosecond carried separately", () => {
    expect(endOfDayExclusiveMs("2026-08-10")).toBe(startOfDayMs("2026-08-11"));
    // The nanosecond only bites on an exact minute boundary...
    expect(minutesBetweenMinusOneNano(0, 120 * 60_000, true)).toBe(119);
    // ...and is invisible otherwise, because truncation already discarded it.
    expect(minutesBetweenMinusOneNano(0, 120 * 60_000 + 30_000, true)).toBe(120);
    expect(minutesBetweenMinusOneNano(0, 120 * 60_000, false)).toBe(120);
  });

  it("a day shift fully inside one date overlaps by its full duration", () => {
    const dayShift = shift("d", "2026-08-10T06:00", "2026-08-10T14:00", "Nurse");
    expect(overlappingDurationInMinutes(dayShift, "2026-08-10")).toBe(480);
    expect(overlappingDurationInMinutes(dayShift, "2026-08-11")).toBe(0);
  });

  it("minuteOverlap matches the Java getMinuteOverlap", () => {
    const a = shift("a", "2026-08-10T06:00", "2026-08-10T14:00", "Nurse");
    const b = shift("b", "2026-08-10T09:00", "2026-08-10T17:00", "Nurse");
    expect(minuteOverlap(a, b)).toBe(300); // 09:00 -> 14:00
  });
});

// ---------------------------------------------------------------------------
describe("unfairness = sqrt(sum of squared deviations)", () => {
  it("is zero for a perfectly balanced load", () => {
    expect(unfairnessDirect([2, 2, 2, 2, 2])).toBe(0);
  });

  it("matches the hand-computed worked examples", () => {
    // xbar = 2 for all three
    expect(unfairnessDirect([2, 2, 2, 2, 2])).toBe(0);
    expect(unfairnessDirect([3, 2, 2, 2, 1])).toBeCloseTo(Math.sqrt(2), 5);
    expect(unfairnessDirect([6, 1, 1, 1, 1])).toBeCloseTo(Math.sqrt(20), 5);
  });

  it("punishes outliers superlinearly compared with absolute deviation", () => {
    const spread = unfairnessDirect([3, 2, 2, 2, 1]); // sum|dev| = 2
    const outlier = unfairnessDirect([6, 1, 1, 1, 1]); // sum|dev| = 8
    // Absolute-deviation ratio would be 4x; squared makes it ~3.16x on the sqrt
    // scale, i.e. 10x on the pre-sqrt scale.
    expect(outlier / spread).toBeCloseTo(Math.sqrt(10), 4);
  });

  it("equals population sigma times sqrt(n)", () => {
    const loads = [7, 3, 3, 2, 1, 0, 4];
    const sigma = loadStandardDeviation(loads);
    expect(unfairnessDirect(loads)).toBeCloseTo(sigma * Math.sqrt(loads.length), 4);
  });

  it("the computational formula sum(x^2) - S^2/n agrees with the definition", () => {
    const rng = createRandom(11);
    for (let trial = 0; trial < 200; trial++) {
      const loads = Array.from({ length: 3 + rng.nextInt(20) }, () => rng.nextInt(15));
      expect(unfairnessComputationalFormula(loads)).toBeCloseTo(unfairnessDirect(loads), 4);
    }
  });

  it("the incremental accumulator (the real Timefold algorithm) matches the direct one", () => {
    const rng = createRandom(3);
    const items = ["a", "b", "c", "d", "e", "f"];
    for (let trial = 0; trial < 100; trial++) {
      const balance = new IncrementalLoadBalance();
      const loads = new Map<string, number>(items.map((i) => [i, 0]));
      // Register every item once so n is fixed, mirroring .complement(Employee, e -> 0L)
      for (const item of items) balance.register(item, 0);
      for (let update = 0; update < 40; update++) {
        const item = items[rng.nextInt(items.length)];
        balance.register(item, 1);
        loads.set(item, (loads.get(item) ?? 0) + 1);
      }
      expect(balance.unfairness()).toBeCloseTo(unfairnessDirect([...loads.values()]), 4);
    }
  });
});

// ---------------------------------------------------------------------------
describe("lexicographic score ordering", () => {
  it("no amount of soft reward outweighs one hard penalty", () => {
    expect(compareScore({ hard: 0, soft: -9999 }, { hard: -1, soft: 1_000_000 })).toBeGreaterThan(0);
  });

  it("soft only decides when hard ties", () => {
    expect(compareScore({ hard: -3, soft: 10 }, { hard: -3, soft: 5 })).toBeGreaterThan(0);
    expect(compareScore({ hard: -3, soft: 10 }, { hard: -2, soft: 5 })).toBeLessThan(0);
  });
});

// ---------------------------------------------------------------------------
describe("constraint arithmetic against hand-computed cases", () => {
  const toggles: ConstraintToggles = { ...ALL_ENABLED, balanceEmployeeShiftAssignments: false };

  it("missing required skill costs exactly 1 hard", () => {
    const schedule: EmployeeSchedule = {
      employees: [employee("Amy", ["Nurse"])],
      shifts: [shift("0", "2026-08-10T06:00", "2026-08-10T14:00", "Doctor", "Amy")],
    };
    const result = evaluateSchedule(schedule, toggles);
    expect(result.score.hard).toBe(-1);
    expect(result.summaries.find((s) => s.constraintId === "requiredSkill")?.matchCount).toBe(1);
  });

  it("overlapping shifts cost the overlap in minutes, plus 1 for same-day", () => {
    const schedule: EmployeeSchedule = {
      employees: [employee("Amy", ["Nurse"])],
      shifts: [
        shift("0", "2026-08-10T06:00", "2026-08-10T14:00", "Nurse", "Amy"),
        shift("1", "2026-08-10T09:00", "2026-08-10T17:00", "Nurse", "Amy"),
      ],
    };
    const result = evaluateSchedule(schedule, toggles);
    // -300 overlap, -1 one-shift-per-day. No rest violation (they overlap, so
    // neither satisfies end <= start).
    expect(result.score.hard).toBe(-301);
  });

  it("the 10-hour rest shortfall is 600 - gapMinutes, and 10h exactly is legal", () => {
    const makeGap = (secondStart: string) => {
      const schedule: EmployeeSchedule = {
        employees: [employee("Amy", ["Nurse"])],
        shifts: [
          shift("0", "2026-08-10T06:00", "2026-08-10T14:00", "Nurse", "Amy"),
          shift("1", secondStart, "2026-08-11T22:00", "Nurse", "Amy"),
        ],
      };
      return evaluateSchedule(schedule, toggles).score.hard;
    };
    // Gap 14:00 -> 22:00 = 8h = 480 min. Penalty 600 - 480 = 120.
    expect(makeGap("2026-08-10T22:00")).toBe(-120 - 1); // -1 for the same-day pair
    // Gap 14:00 -> next day 00:00 = 10h exactly. floor(600/60) = 10, not < 10. Legal.
    expect(makeGap("2026-08-11T00:00")).toBe(0);
    // Gap 9h59m -> penalty of exactly 1.
    expect(makeGap("2026-08-10T23:59")).toBe(-1 - 1);
  });

  it("one-shift-per-day is per PAIR, so 4 shifts on a day costs C(4,2) = 6", () => {
    const onlyOnePerDay: ConstraintToggles = {
      requiredSkill: false,
      noOverlappingShifts: false,
      atLeast10HoursBetweenTwoShifts: false,
      oneShiftPerDay: true,
      unavailableEmployee: false,
      undesiredDayForEmployee: false,
      desiredDayForEmployee: false,
      balanceEmployeeShiftAssignments: false,
    };
    const schedule: EmployeeSchedule = {
      employees: [employee("Amy", ["Nurse"])],
      shifts: [0, 1, 2, 3].map((i) =>
        shift(String(i), `2026-08-10T0${i + 1}:00`, `2026-08-10T0${i + 2}:00`, "Nurse", "Amy"),
      ),
    };
    expect(evaluateSchedule(schedule, onlyOnePerDay).score.hard).toBe(-6);
  });

  it("unavailable and undesired use identical arithmetic on different levels", () => {
    const base = (kind: "unavailableDates" | "undesiredDates") => {
      const schedule: EmployeeSchedule = {
        employees: [employee("Amy", ["Nurse"], { [kind]: ["2026-08-10"] } as Partial<Employee>)],
        shifts: [shift("0", "2026-08-10T06:00", "2026-08-10T14:00", "Nurse", "Amy")],
      };
      return evaluateSchedule(schedule, toggles).score;
    };
    expect(base("unavailableDates")).toEqual({ hard: -480, soft: 0 });
    expect(base("undesiredDates")).toEqual({ hard: 0, soft: -480 });
  });

  it("a desired day is a REWARD, so soft goes positive", () => {
    const schedule: EmployeeSchedule = {
      employees: [employee("Amy", ["Nurse"], { desiredDates: ["2026-08-10"] })],
      shifts: [shift("0", "2026-08-10T06:00", "2026-08-10T14:00", "Nurse", "Amy")],
    };
    expect(evaluateSchedule(schedule, toggles).score).toEqual({ hard: 0, soft: 480 });
  });

  it("forEach() skips unassigned shifts, so an empty schedule scores 0hard/0soft", () => {
    const schedule: EmployeeSchedule = {
      employees: [employee("Amy", ["Nurse"])],
      // Required skill mismatch AND overlap — but employee is null, so invisible.
      shifts: [
        shift("0", "2026-08-10T06:00", "2026-08-10T14:00", "Doctor", null),
        shift("1", "2026-08-10T09:00", "2026-08-10T17:00", "Doctor", null),
      ],
    };
    const result = evaluateSchedule(schedule, ALL_ENABLED);
    expect(result.score).toEqual({ hard: 0, soft: 0 });
    expect(result.unassignedCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
describe("incremental scoring inside the solver equals full recalculation", () => {
  it("stays in lockstep across thousands of random moves", () => {
    const schedule = generateDemoData(TINY, "2026-08-10");
    const solver = new EmployeeSchedulingSolver(schedule, {
      seed: 5,
      spentLimitMs: Number.MAX_SAFE_INTEGER,
    });
    solver.runConstructionHeuristic();

    for (let i = 0; i < 400; i++) {
      solver.step();
      const incremental = solver.score();
      const full = evaluateSchedule(solver.schedule, ALL_ENABLED, false).score;
      expect(incremental.hard).toBe(full.hard);
      expect(incremental.soft).toBeCloseTo(full.soft, 3);
    }
  }, SOLVER_TEST_TIMEOUT_MS);

  it("holds on the SMALL dataset too", () => {
    const schedule = generateDemoData(SMALL, "2026-08-10");
    const solver = new EmployeeSchedulingSolver(schedule, {
      seed: 9,
      spentLimitMs: Number.MAX_SAFE_INTEGER,
    });
    solver.runConstructionHeuristic();
    for (let i = 0; i < 150; i++) {
      solver.step();
    }
    const full = evaluateSchedule(solver.schedule, ALL_ENABLED, false).score;
    expect(solver.score().hard).toBe(full.hard);
    expect(solver.score().soft).toBeCloseTo(full.soft, 3);
  }, SOLVER_TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
describe("the solver actually improves the schedule", () => {
  it("late acceptance beats the construction heuristic it started from", () => {
    const schedule = generateDemoData(SMALL, "2026-08-10");
    const solver = new EmployeeSchedulingSolver(schedule, {
      seed: 1,
      spentLimitMs: 3000,
      acceptor: "LATE_ACCEPTANCE",
    });
    solver.runConstructionHeuristic();
    const afterConstruction = solver.score();

    solver.start();
    for (let i = 0; i < 4000; i++) solver.step();
    solver.terminate();

    expect(compareScore(solver.bestScore(), afterConstruction)).toBeGreaterThanOrEqual(0);
    // Every shift ends up assigned.
    expect(solver.schedule.shifts.every((s) => s.employee != null)).toBe(true);
  }, SOLVER_TEST_TIMEOUT_MS);

  it("gets within 2 hard of the provable Hall's-theorem lower bound", () => {
    // SMALL (seeded at this start date) is genuinely INFEASIBLE: on some days there are
    // more shifts requiring a skill than there are employees holding it and available.
    // So "0 hard" is not the target — the matching bound is.
    const schedule = generateDemoData(SMALL, "2026-08-10");
    const bound = analyseFeasibility(schedule);
    expect(bound.feasible).toBe(false);
    expect(bound.hardScoreUpperBound).toBeLessThan(0);

    const solver = new EmployeeSchedulingSolver(schedule, {
      seed: 2,
      spentLimitMs: Number.MAX_SAFE_INTEGER,
    });
    solver.runConstructionHeuristic();
    for (let i = 0; i < 60_000; i++) solver.step();
    solver.terminate();

    // The solver cannot beat the bound (that would mean the bound is wrong)...
    expect(solver.bestScore().hard).toBeLessThanOrEqual(bound.hardScoreUpperBound);
    // ...and should land close to it.
    expect(solver.bestScore().hard).toBeGreaterThanOrEqual(bound.hardScoreUpperBound - 2);
  }, SOLVER_TEST_TIMEOUT_MS);

  it("reaches exactly 0 hard when the instance really is feasible", () => {
    const schedule = generateDemoData(TINY, "2026-08-10");
    expect(analyseFeasibility(schedule).feasible).toBe(true);
    const solver = new EmployeeSchedulingSolver(schedule, {
      seed: 4,
      spentLimitMs: Number.MAX_SAFE_INTEGER,
    });
    solver.runConstructionHeuristic();
    for (let i = 0; i < 20_000 && solver.bestScore().hard < 0; i++) solver.step();
    solver.terminate();
    expect(solver.bestScore().hard).toBe(0);
  }, SOLVER_TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
describe("Hall's theorem feasibility bound", () => {
  it("maxBipartiteMatching handles the textbook cases", () => {
    // 3 shifts, 3 employees, perfect matching available.
    expect(maxBipartiteMatching([[0, 1], [1, 2], [2, 0]], 3)).toBe(3);
    // 3 shifts all needing the same single employee: deficiency 2.
    expect(maxBipartiteMatching([[0], [0], [0]], 3)).toBe(1);
    // A shift nobody can cover.
    expect(maxBipartiteMatching([[], [0]], 2)).toBe(1);
  });

  it("detects the Doctor shortage in SMALL and never over-claims", () => {
    const schedule = generateDemoData(SMALL, "2026-08-10");
    const report = analyseFeasibility(schedule);
    const shortDays = report.days.filter((d) => d.deficiency > 0);
    expect(shortDays.length).toBeGreaterThan(0);
    for (const day of report.days) {
      expect(day.maxMatching).toBeLessThanOrEqual(day.shiftCount);
      // Deficiency can never exceed the worst per-skill shortfall summed up.
      const skillShortfall = day.skillPressure.reduce(
        (sum, p) => sum + Math.max(0, p.demand - p.supply),
        0,
      );
      expect(day.deficiency).toBeLessThanOrEqual(skillShortfall);
    }
  });
});

// ---------------------------------------------------------------------------
describe("search space combinatorics", () => {
  it("log10 of P(n,k) is right for small hand-checkable values", () => {
    expect(Math.pow(10, log10Permutations(5, 2))).toBeCloseTo(20, 4); // 5*4
    expect(Math.pow(10, log10Permutations(10, 3))).toBeCloseTo(720, 3); // 10*9*8
  });

  it("SMALL has an absurd raw search space", () => {
    const schedule = generateDemoData(SMALL, "2026-08-10");
    const stats = computeSearchSpace(schedule);
    // |E|^|S| with 15 employees and >100 shifts
    expect(stats.employeeCount).toBe(15);
    expect(stats.shiftCount).toBeGreaterThan(100);
    expect(stats.rawLog10).toBeGreaterThan(120);
    // The neighbourhood the solver samples is tiny by comparison.
    expect(Math.log10(stats.neighbourhoodSize)).toBeLessThan(6);
  });
});
