/**
 * Port of EmployeeSchedulingConstraintProvider.java — all 8 constraints, with the
 * exact same penalty *magnitudes* as the Java, plus per-match justifications so the
 * UI can explain every unit of score.
 *
 * ===========================================================================
 * THE SHAPE OF A CONSTRAINT STREAM
 * ===========================================================================
 * Every constraint is a pipeline: a source, some joins/filters, then a verdict.
 *
 *   forEach(Shift)            -> stream of shifts
 *   forEachUniquePair(Shift)  -> stream of unordered pairs, each pair once (i<j)
 *   .join(X, joiner)          -> cartesian product, pruned by the joiner via hash index
 *   .filter(pred)             -> arbitrary predicate (NOT indexed — slower than a joiner)
 *   .flattenLast(fn)          -> explodes a collection in the last tuple slot into rows
 *   .groupBy(key, collector)  -> aggregation
 *   .penalize(w, matchWeigher)/.reward(...)  -> score impact = -w * matchWeigher(tuple)
 *   .asConstraint(name)
 *
 * TWO GOTCHAS WORTH INTERNALISING
 *
 * 1. `forEach(Shift.class)` SILENTLY SKIPS shifts whose planning variable is null.
 *    So an unassigned shift is not "missing a skill" — it is invisible to constraints
 *    1-7 entirely, and contributes 0 to Sigma x_i in constraint 8. That is why an
 *    empty schedule scores 0hard/0soft and looks "perfect". Use
 *    forEachIncludingUnassigned to count unassigned shifts. (This model does not, so
 *    the construction heuristic is what guarantees full assignment.)
 *
 * 2. A joiner is not sugar for a filter. `equal(Shift::getEmployee)` builds a hash
 *    index, so the pair stream is O(sum over employees of k_e^2) instead of O(n^2).
 *    Moving that condition into `.filter()` would give the same score and a much
 *    slower solver. See mathNotes / MathLab "Why joiners beat filters".
 */

import {
  dateOf,
  isOverlappingWithDate,
  minuteOverlap,
  minutesBetween,
  overlappingDurationInMinutes,
  toMillis,
  type Employee,
  type EmployeeSchedule,
  type HardSoftScore,
  type IsoDate,
  type Shift,
} from "./domain";
import { unfairnessDirect } from "./loadBalance";
import { toSixSignificantDigits } from "./score";

export type ConstraintLevel = "HARD" | "SOFT";

export type ConstraintId =
  | "requiredSkill"
  | "noOverlappingShifts"
  | "atLeast10HoursBetweenTwoShifts"
  | "oneShiftPerDay"
  | "unavailableEmployee"
  | "undesiredDayForEmployee"
  | "desiredDayForEmployee"
  | "balanceEmployeeShiftAssignments";

export interface ConstraintDefinition {
  id: ConstraintId;
  /** The string passed to asConstraint(...) in the Java. */
  name: string;
  level: ConstraintLevel;
  /** penalize or reward. */
  direction: "PENALIZE" | "REWARD";
  /** The stream pipeline, as written in Java. */
  stream: string;
  /** The match weigher, in plain arithmetic. */
  weightFormula: string;
  /** Why this weigher and not a flat 1. */
  weightRationale: string;
  plainEnglish: string;
  /** What goes wrong if you delete this constraint. */
  ifRemoved: string;
  javaMethod: string;
}

export const CONSTRAINTS: ConstraintDefinition[] = [
  {
    id: "requiredSkill",
    name: "Missing required skill",
    level: "HARD",
    direction: "PENALIZE",
    stream: "forEach(Shift).filter(s -> !s.employee.skills.contains(s.requiredSkill))",
    weightFormula: "1 per offending shift",
    weightRationale:
      "Skill mismatch is binary — an employee either holds the certification or does not. There is no 'more wrong', so a flat weight of 1 is the honest encoding. A weigher here would invent a distinction that does not exist.",
    plainEnglish: "An employee must have the skill their shift requires.",
    ifRemoved:
      "The solver will happily put a Nurse on an Anaesthetics shift, because doing so relieves pressure on the other constraints (fewer overlaps, better balance). Skills are the only thing stopping it.",
    javaMethod: "requiredSkill(ConstraintFactory)",
  },
  {
    id: "noOverlappingShifts",
    name: "Overlapping shift",
    level: "HARD",
    direction: "PENALIZE",
    stream:
      "forEachUniquePair(Shift, equal(Shift::getEmployee), overlapping(Shift::getStart, Shift::getEnd))",
    weightFormula: "minutes of overlap = max(0, min(end1,end2) - max(start1,start2))",
    weightRationale:
      "Weighing by minutes gives the solver a GRADIENT. With a flat weight of 1, an 8-hour double-booking and a 5-minute one look identical, so any move that shortens the overlap without eliminating it earns nothing and the search has no downhill direction to follow. Minutes make partial progress visible.",
    plainEnglish: "Nobody can be in two places at once.",
    ifRemoved:
      "One popular employee gets stacked with simultaneous shifts — physically impossible, but numerically it satisfies skills and reduces unfairness for everyone else.",
    javaMethod: "noOverlappingShifts(ConstraintFactory)",
  },
  {
    id: "atLeast10HoursBetweenTwoShifts",
    name: "At least 10 hours between 2 shifts",
    level: "HARD",
    direction: "PENALIZE",
    stream:
      "forEach(Shift).join(Shift, equal(employee), lessThanOrEqual(Shift::getEnd, Shift::getStart)).filter(gap < 10h)",
    weightFormula: "(10 * 60) - gapMinutes,  applied only when floor(gapHours) < 10",
    weightRationale:
      "A shortfall measure: 0 at a 10-hour break, 600 at a back-to-back handover. Again a gradient — pushing a shift 30 minutes later is rewarded even while still illegal. Note floor(): a 10h30m gap gives toHours()==10, not < 10, so it is legal; a 9h59m gap gives 9 and costs exactly 1.",
    plainEnglish: "At least 10 hours of rest between two shifts.",
    ifRemoved:
      "Classic 'clopening' — a 14:00-22:00 shift followed by 06:00 the next morning. Legal to the solver, brutal to the human.",
    javaMethod: "atLeast10HoursBetweenTwoShifts(ConstraintFactory)",
  },
  {
    id: "oneShiftPerDay",
    name: "Max one shift per day",
    level: "HARD",
    direction: "PENALIZE",
    stream:
      "forEachUniquePair(Shift, equal(Shift::getEmployee), equal(s -> s.getStart().toLocalDate()))",
    weightFormula: "1 per offending pair of shifts on the same start date",
    weightRationale:
      "Counted per PAIR, not per day, so the penalty grows quadratically in the pile-up: 2 shifts on a day costs 1, but 4 shifts costs C(4,2) = 6. That superlinearity discourages hoarding, and it is a free consequence of using forEachUniquePair.",
    plainEnglish: "One shift per employee per calendar day.",
    ifRemoved:
      "Split shifts appear — a 06:00-14:00 and a 22:00-06:00 on the same date are 8 hours apart in neither direction that the rest constraint catches cleanly.",
    javaMethod: "oneShiftPerDay(ConstraintFactory)",
  },
  {
    id: "unavailableEmployee",
    name: "Unavailable employee",
    level: "HARD",
    direction: "PENALIZE",
    stream:
      "forEach(Shift).join(Employee, equal(employee, identity)).flattenLast(Employee::getUnavailableDates).filter(Shift::isOverlappingWithDate)",
    weightFormula: "overlapping minutes between the shift and that calendar day",
    weightRationale:
      "Same gradient logic, with a subtlety: the day window ends at LocalTime.MAX (23:59:59.999999999), and ChronoUnit.MINUTES truncates. So a 22:00-06:00 night shift overlaps its FIRST day by 119 minutes, not 120. The missing minute is real, not a bug in this port.",
    plainEnglish: "Do not schedule someone on a day they marked unavailable.",
    ifRemoved:
      "Hard availability collapses into a preference, and the solver trades it away whenever balance or desired-days pay more.",
    javaMethod: "unavailableEmployee(ConstraintFactory)",
  },
  {
    id: "undesiredDayForEmployee",
    name: "Undesired day for employee",
    level: "SOFT",
    direction: "PENALIZE",
    stream: "same pipeline as above, over Employee::getUndesiredDates",
    weightFormula: "overlapping minutes between the shift and that calendar day",
    weightRationale:
      "Identical arithmetic to the hard 'unavailable' constraint — only the LEVEL differs. That is the cleanest possible demonstration of what hard vs soft means: same measurement, different tier in the lexicographic order.",
    plainEnglish: "Avoid days the employee would rather not work.",
    ifRemoved: "Preferences stop mattering; the schedule is legal but resented.",
    javaMethod: "undesiredDayForEmployee(ConstraintFactory)",
  },
  {
    id: "desiredDayForEmployee",
    name: "Desired day for employee",
    level: "SOFT",
    direction: "REWARD",
    stream: "same pipeline, over Employee::getDesiredDates, but .reward(...)",
    weightFormula: "+ overlapping minutes (a REWARD, so soft score goes UP)",
    weightRationale:
      "The only reward in the model, and the reason soft score can be positive. It also means soft score alone tells you nothing about quality unless you know the reward ceiling: sum over all desired-date minutes available.",
    plainEnglish: "Prefer days the employee asked for.",
    ifRemoved:
      "Requests are ignored. The solver has no incentive to seek out good days, only to avoid bad ones.",
    javaMethod: "desiredDayForEmployee(ConstraintFactory)",
  },
  {
    id: "balanceEmployeeShiftAssignments",
    name: "Balance employee shift assignments",
    level: "SOFT",
    direction: "PENALIZE",
    stream:
      "forEach(Shift).groupBy(employee, count()).complement(Employee, e -> 0L).groupBy(loadBalance(...)).penalizeBigDecimal(ONE_SOFT, LoadBalance::unfairness)",
    weightFormula: "unfairness = sqrt( sum_i (x_i - xbar)^2 )   [6 significant digits]",
    weightRationale:
      "The whole schedule collapses to ONE match. unfairness is the L2 norm of the deviation-from-mean vector — sigma * sqrt(n), not sigma. Squaring punishes outliers superlinearly, so 'one person does everything' scores far worse than 'everyone slightly off'. .complement(...) is essential: without it, an employee given zero shifts is absent from the group and their idleness is invisible, so the 'fairest' solution would be to overload a handful of people.",
    plainEnglish: "Spread the workload evenly, counting people who got nothing.",
    ifRemoved:
      "The solver finds a legal schedule where a few employees carry everything, because nothing else in the model cares how many shifts one person has (only that they do not collide).",
    javaMethod: "balanceEmployeeShiftAssignments(ConstraintFactory)",
  },
];

export const CONSTRAINT_BY_ID: Record<ConstraintId, ConstraintDefinition> =
  Object.fromEntries(CONSTRAINTS.map((c) => [c.id, c])) as Record<
    ConstraintId,
    ConstraintDefinition
  >;

export type ConstraintToggles = Record<ConstraintId, boolean>;

export const ALL_ENABLED: ConstraintToggles = Object.fromEntries(
  CONSTRAINTS.map((c) => [c.id, true]),
) as ConstraintToggles;

/** One justified violation (or reward). `impact` is the signed effect on its score level. */
export interface ConstraintMatch {
  constraintId: ConstraintId;
  level: ConstraintLevel;
  /** Signed score impact: negative for penalties, positive for rewards. */
  impact: number;
  /** The raw match weight before sign, i.e. what the matchWeigher returned. */
  weight: number;
  employee: string | null;
  shiftIds: string[];
  date?: IsoDate;
  explanation: string;
  /** Arithmetic shown to the learner, e.g. "600 - 480 = 120". */
  arithmetic: string;
}

export interface ConstraintSummary {
  constraintId: ConstraintId;
  matchCount: number;
  /** Total signed impact on that level. */
  impact: number;
}

export interface ScoreExplanation {
  score: HardSoftScore;
  matches: ConstraintMatch[];
  summaries: ConstraintSummary[];
  /** Shift id -> hard match count, for painting the board. */
  hardViolationsByShift: Map<string, number>;
  softViolationsByShift: Map<string, number>;
  loads: Map<string, number>;
  unfairness: number;
  /** Number of shifts with employee === null. Invisible to the constraints; shown for honesty. */
  unassignedCount: number;
}

// ---------------------------------------------------------------------------
// Per-employee evaluation.
//
// Constraints 1-7 are all conditioned on `shift.employee`, so the score decomposes
// as a SUM OVER EMPLOYEES. That is not an optimisation trick we invented — it is a
// structural property of this constraint set, and it is what makes incremental score
// calculation possible: a move that reassigns one shift can only change the terms of
// the two employees involved. See solver.ts.
// ---------------------------------------------------------------------------

export interface EmployeeScoreTerm {
  hard: number;
  soft: number;
  matches: ConstraintMatch[];
}

const EMPTY_TERM: EmployeeScoreTerm = { hard: 0, soft: 0, matches: [] };

export function evaluateEmployee(
  employee: Employee,
  shifts: Shift[],
  toggles: ConstraintToggles,
  collectMatches: boolean,
): EmployeeScoreTerm {
  if (shifts.length === 0) return collectMatches ? { hard: 0, soft: 0, matches: [] } : EMPTY_TERM;

  let hard = 0;
  let soft = 0;
  const matches: ConstraintMatch[] = collectMatches ? [] : [];

  const sorted = [...shifts].sort((a, b) => toMillis(a.start) - toMillis(b.start));

  // --- 1. Missing required skill (hard, weight 1) -------------------------
  if (toggles.requiredSkill) {
    for (const shift of sorted) {
      if (!employee.skills.includes(shift.requiredSkill)) {
        hard -= 1;
        if (collectMatches) {
          matches.push({
            constraintId: "requiredSkill",
            level: "HARD",
            impact: -1,
            weight: 1,
            employee: employee.name,
            shiftIds: [shift.id],
            explanation: `${employee.name} does not have "${shift.requiredSkill}" (has: ${employee.skills.join(", ")})`,
            arithmetic: "flat weight 1",
          });
        }
      }
    }
  }

  // --- Pairwise constraints (2, 3, 4) ------------------------------------
  const needPairs =
    toggles.noOverlappingShifts ||
    toggles.atLeast10HoursBetweenTwoShifts ||
    toggles.oneShiftPerDay;

  if (needPairs) {
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i];
      const aStart = toMillis(a.start);
      const aEnd = toMillis(a.end);
      for (let j = i + 1; j < sorted.length; j++) {
        const b = sorted[j];
        const bStart = toMillis(b.start);
        const bEnd = toMillis(b.end);

        // 2. Overlapping shift — Joiners.overlapping is STRICT overlap.
        if (toggles.noOverlappingShifts && aStart < bEnd && bStart < aEnd) {
          const overlap = minuteOverlap(a, b);
          if (overlap > 0) {
            hard -= overlap;
            if (collectMatches) {
              matches.push({
                constraintId: "noOverlappingShifts",
                level: "HARD",
                impact: -overlap,
                weight: overlap,
                employee: employee.name,
                shiftIds: [a.id, b.id],
                explanation: `${a.location} ${a.start.slice(11, 16)}-${a.end.slice(11, 16)} overlaps ${b.location} ${b.start.slice(11, 16)}-${b.end.slice(11, 16)} by ${overlap} min`,
                arithmetic: `min(end) - max(start) = ${overlap} min`,
              });
            }
          }
        }

        // 3. At least 10 hours between two shifts.
        // Java: join(..., lessThanOrEqual(Shift::getEnd, Shift::getStart)) then gap < 10h.
        if (toggles.atLeast10HoursBetweenTwoShifts && aEnd <= bStart) {
          const gapMinutes = minutesBetween(aEnd, bStart);
          // Duration.toHours() truncates, matching Math.floor here.
          if (Math.floor(gapMinutes / 60) < 10) {
            const penalty = 10 * 60 - gapMinutes;
            hard -= penalty;
            if (collectMatches) {
              matches.push({
                constraintId: "atLeast10HoursBetweenTwoShifts",
                level: "HARD",
                impact: -penalty,
                weight: penalty,
                employee: employee.name,
                shiftIds: [a.id, b.id],
                explanation: `Only ${Math.floor(gapMinutes / 60)}h ${gapMinutes % 60}m rest between ${a.end.slice(5, 16).replace("T", " ")} and ${b.start.slice(5, 16).replace("T", " ")}`,
                arithmetic: `600 - ${gapMinutes} = ${penalty}`,
              });
            }
          }
        }

        // 4. Max one shift per day — compares START dates only.
        if (toggles.oneShiftPerDay && dateOf(a.start) === dateOf(b.start)) {
          hard -= 1;
          if (collectMatches) {
            matches.push({
              constraintId: "oneShiftPerDay",
              level: "HARD",
              impact: -1,
              weight: 1,
              employee: employee.name,
              shiftIds: [a.id, b.id],
              date: dateOf(a.start),
              explanation: `Two shifts starting on ${dateOf(a.start)}`,
              arithmetic: "flat weight 1 per pair",
            });
          }
        }
      }
    }
  }

  // --- Date-preference constraints (5, 6, 7) ------------------------------
  const dateRules: Array<{
    id: ConstraintId;
    dates: string[];
    level: ConstraintLevel;
    sign: -1 | 1;
    label: string;
  }> = [];
  if (toggles.unavailableEmployee)
    dateRules.push({
      id: "unavailableEmployee",
      dates: employee.unavailableDates,
      level: "HARD",
      sign: -1,
      label: "unavailable",
    });
  if (toggles.undesiredDayForEmployee)
    dateRules.push({
      id: "undesiredDayForEmployee",
      dates: employee.undesiredDates,
      level: "SOFT",
      sign: -1,
      label: "undesired",
    });
  if (toggles.desiredDayForEmployee)
    dateRules.push({
      id: "desiredDayForEmployee",
      dates: employee.desiredDates,
      level: "SOFT",
      sign: 1,
      label: "desired",
    });

  for (const rule of dateRules) {
    if (rule.dates.length === 0) continue;
    for (const shift of sorted) {
      for (const date of rule.dates) {
        // flattenLast + filter(Shift::isOverlappingWithDate)
        if (!isOverlappingWithDate(shift, date)) continue;
        const minutes = overlappingDurationInMinutes(shift, date);
        if (minutes <= 0) continue;
        const impact = rule.sign * minutes;
        if (rule.level === "HARD") hard += impact;
        else soft += impact;
        if (collectMatches) {
          matches.push({
            constraintId: rule.id,
            level: rule.level,
            impact,
            weight: minutes,
            employee: employee.name,
            shiftIds: [shift.id],
            date,
            explanation: `${date} is ${rule.label} for ${employee.name}; ${minutes} min of this shift falls on it`,
            arithmetic: `overlap(shift, [${date} 00:00, ${date} 23:59:59.999999999]) = ${minutes} min`,
          });
        }
      }
    }
  }

  return { hard, soft, matches };
}

/** Group shifts by assigned employee. Unassigned shifts are collected separately. */
export function groupShiftsByEmployee(schedule: EmployeeSchedule): {
  byEmployee: Map<string, Shift[]>;
  unassigned: Shift[];
} {
  const byEmployee = new Map<string, Shift[]>();
  for (const employee of schedule.employees) byEmployee.set(employee.name, []);
  const unassigned: Shift[] = [];
  for (const shift of schedule.shifts) {
    if (shift.employee == null) {
      unassigned.push(shift);
      continue;
    }
    const list = byEmployee.get(shift.employee);
    if (list) list.push(shift);
    else byEmployee.set(shift.employee, [shift]);
  }
  return { byEmployee, unassigned };
}

/**
 * Full score calculation from scratch, with explanations. This is the
 * "EasyScoreCalculator" of our port: correct, readable, and deliberately NOT what
 * the solver's inner loop uses.
 */
export function evaluateSchedule(
  schedule: EmployeeSchedule,
  toggles: ConstraintToggles = ALL_ENABLED,
  collectMatches = true,
): ScoreExplanation {
  const { byEmployee, unassigned } = groupShiftsByEmployee(schedule);
  const employeeByName = new Map(schedule.employees.map((e) => [e.name, e]));

  let hard = 0;
  let soft = 0;
  const matches: ConstraintMatch[] = [];

  for (const [name, shifts] of byEmployee) {
    const employee = employeeByName.get(name);
    if (!employee) continue;
    const term = evaluateEmployee(employee, shifts, toggles, collectMatches);
    hard += term.hard;
    soft += term.soft;
    if (collectMatches) matches.push(...term.matches);
  }

  // --- 8. Balance (aggregate over the whole solution) --------------------
  // .complement(Employee.class, e -> 0L) means EVERY employee is in the load vector,
  // including those with zero shifts.
  const loads = new Map<string, number>();
  for (const employee of schedule.employees) loads.set(employee.name, 0);
  for (const [name, shifts] of byEmployee) loads.set(name, shifts.length);

  const loadValues = [...loads.values()];
  const unfairness = unfairnessDirect(loadValues);
  if (toggles.balanceEmployeeShiftAssignments) {
    soft -= unfairness;
    if (collectMatches && unfairness !== 0) {
      const total = loadValues.reduce((a, b) => a + b, 0);
      const mean = total / (loadValues.length || 1);
      matches.push({
        constraintId: "balanceEmployeeShiftAssignments",
        level: "SOFT",
        impact: -unfairness,
        weight: unfairness,
        employee: null,
        shiftIds: [],
        explanation: `${total} assigned shifts over ${loadValues.length} employees (mean ${mean.toFixed(2)}); load spread costs ${unfairness}`,
        arithmetic: `sqrt(sum (x_i - ${mean.toFixed(2)})^2) = ${unfairness}`,
      });
    }
  }

  const summaryMap = new Map<ConstraintId, ConstraintSummary>();
  for (const c of CONSTRAINTS)
    summaryMap.set(c.id, { constraintId: c.id, matchCount: 0, impact: 0 });
  const hardViolationsByShift = new Map<string, number>();
  const softViolationsByShift = new Map<string, number>();
  for (const match of matches) {
    const summary = summaryMap.get(match.constraintId)!;
    summary.matchCount += 1;
    summary.impact += match.impact;
    const target = match.level === "HARD" ? hardViolationsByShift : softViolationsByShift;
    if (match.impact < 0)
      for (const id of match.shiftIds) target.set(id, (target.get(id) ?? 0) + 1);
  }

  return {
    score: { hard, soft: toSixSignificantDigits(soft) },
    matches,
    summaries: [...summaryMap.values()],
    hardViolationsByShift,
    softViolationsByShift,
    loads,
    unfairness,
    unassignedCount: unassigned.length,
  };
}

/**
 * The theoretical ceiling on soft score: every desired-date minute collected, no
 * undesired minute incurred, perfect balance. Useful because a bare soft number
 * like "-1834" means nothing without a scale.
 */
export function softScoreCeiling(schedule: EmployeeSchedule): number {
  let ceiling = 0;
  const employeeByName = new Map(schedule.employees.map((e) => [e.name, e]));
  for (const shift of schedule.shifts) {
    let best = 0;
    for (const employee of employeeByName.values()) {
      let value = 0;
      for (const date of employee.desiredDates) {
        if (isOverlappingWithDate(shift, date))
          value += overlappingDurationInMinutes(shift, date);
      }
      best = Math.max(best, value);
    }
    ceiling += best;
  }
  return ceiling;
}
