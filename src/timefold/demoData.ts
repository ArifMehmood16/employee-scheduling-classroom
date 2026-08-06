/**
 * Port of DemoDataGenerator.java.
 *
 * The Java uses `new Random(randomSeed)` with seed 0, so its data is reproducible.
 * We cannot match java.util.Random's exact bit stream without reimplementing its
 * LCG, so we use our own seeded generator (mulberry32). The DISTRIBUTIONS and the
 * structure are faithful; the specific names drawn are not identical to the Java run.
 * Everything is still deterministic for a given seed, so lessons stay reproducible.
 *
 * WHY THE DATA SHAPE MATTERS MATHEMATICALLY
 * The generator produces roughly 1.25 shifts per (location, start-time) slot, and each
 * location gets 2, 3 or 4 start times per day. So shift count grows linearly in days
 * and locations, while the SEARCH SPACE grows as employees^shifts — exponentially.
 * SMALL is already astronomically large. See searchSpace.ts.
 */

import type { Employee, EmployeeSchedule, IsoDate, Shift } from "./domain";
import { addDays } from "./domain";

export interface CountDistribution {
  count: number;
  weight: number;
}

export interface DemoDataParameters {
  locations: string[];
  requiredSkills: string[];
  optionalSkills: string[];
  daysInSchedule: number;
  employeeCount: number;
  optionalSkillDistribution: CountDistribution[];
  shiftCountDistribution: CountDistribution[];
  availabilityCountDistribution: CountDistribution[];
  randomSeed: number;
}

/** Exactly the SMALL enum constant from DemoDataGenerator.DemoData. */
export const SMALL: DemoDataParameters = {
  locations: ["Ambulatory care", "Critical care", "Pediatric care"],
  requiredSkills: ["Doctor", "Nurse"],
  optionalSkills: ["Anaesthetics", "Cardiology"],
  daysInSchedule: 14,
  employeeCount: 15,
  optionalSkillDistribution: [
    { count: 1, weight: 3 },
    { count: 2, weight: 1 },
  ],
  shiftCountDistribution: [
    { count: 1, weight: 0.9 },
    { count: 2, weight: 0.1 },
  ],
  availabilityCountDistribution: [
    { count: 1, weight: 4 },
    { count: 2, weight: 3 },
    { count: 3, weight: 2 },
    { count: 4, weight: 1 },
  ],
  randomSeed: 0,
};

/** Exactly the LARGE enum constant. */
export const LARGE: DemoDataParameters = {
  locations: [
    "Ambulatory care",
    "Neurology",
    "Critical care",
    "Pediatric care",
    "Surgery",
    "Radiology",
    "Outpatient",
  ],
  requiredSkills: ["Doctor", "Nurse"],
  optionalSkills: ["Anaesthetics", "Cardiology", "Radiology"],
  daysInSchedule: 28,
  employeeCount: 50,
  optionalSkillDistribution: [
    { count: 1, weight: 0.5 },
    { count: 2, weight: 0.3 },
    { count: 3, weight: 0.2 },
  ],
  shiftCountDistribution: [
    { count: 1, weight: 0.5 },
    { count: 2, weight: 0.3 },
    { count: 3, weight: 0.2 },
  ],
  availabilityCountDistribution: [
    { count: 5, weight: 4 },
    { count: 10, weight: 3 },
    { count: 15, weight: 2 },
    { count: 20, weight: 1 },
  ],
  randomSeed: 0,
};

/**
 * A deliberately tiny dataset for the step-by-step lessons: 8 shifts, 4 employees,
 * hand-checkable by eye. Seed 3 is chosen because it is FEASIBLE — see
 * findFeasibleSeed. (Seed 7, for instance, is not: two Doctor shifts land on a day
 * with only one available Doctor.)
 */
export const TINY: DemoDataParameters = {
  locations: ["Critical care"],
  requiredSkills: ["Doctor", "Nurse"],
  optionalSkills: ["Cardiology"],
  daysInSchedule: 4,
  employeeCount: 4,
  optionalSkillDistribution: [{ count: 1, weight: 1 }],
  shiftCountDistribution: [{ count: 1, weight: 1 }],
  availabilityCountDistribution: [{ count: 1, weight: 1 }],
  randomSeed: 3,
};

export const DATASETS = { TINY, SMALL, LARGE } as const;
export type DatasetName = keyof typeof DATASETS;

const FIRST_NAMES = ["Amy", "Beth", "Carl", "Dan", "Elsa", "Flo", "Gus", "Hugo", "Ivy", "Jay"];
const LAST_NAMES = ["Cole", "Fox", "Green", "Jones", "King", "Li", "Poe", "Rye", "Smith", "Watt"];

const SHIFT_LENGTH_HOURS = 8;
const MORNING = "06:00";
const DAY = "09:00";
const AFTERNOON = "14:00";
const NIGHT = "22:00";

/** SHIFT_START_TIMES_COMBOS from the Java — locations cycle through these. */
export const SHIFT_START_TIME_COMBOS: string[][] = [
  [MORNING, AFTERNOON],
  [MORNING, AFTERNOON, NIGHT],
  [MORNING, DAY, AFTERNOON, NIGHT],
];

/** mulberry32 — small, fast, well-distributed 32-bit seeded PRNG. */
export function createRandom(seed: number): {
  next: () => number;
  nextInt: (bound: number) => number;
  nextDouble: (bound: number) => number;
  nextBoolean: () => boolean;
} {
  let state = (seed + 0x6d2b79f5) | 0;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    nextInt: (bound: number) => Math.floor(next() * bound),
    nextDouble: (bound: number) => next() * bound,
    nextBoolean: () => next() < 0.5,
  };
}

type Rng = ReturnType<typeof createRandom>;

/**
 * Port of pickCount: a weighted categorical draw.
 *
 * Draw u ~ Uniform(0, sum of weights), then walk the buckets subtracting weights.
 * P(count = c_k) = w_k / sum(w). For SMALL's shiftCountDistribution
 * [{1, 0.9}, {2, 0.1}] the expected shifts per timeslot is
 * 1*0.9 + 2*0.1 = 1.1.
 */
function pickCount(rng: Rng, distribution: CountDistribution[]): number {
  const totalWeight = distribution.reduce((a, d) => a + d.weight, 0);
  let choice = rng.nextDouble(totalWeight);
  let index = 0;
  while (index < distribution.length - 1 && choice >= distribution[index].weight) {
    choice -= distribution[index].weight;
    index++;
  }
  return distribution[index].count;
}

/** Expected value of a CountDistribution — used by the stats panel. */
export function expectedCount(distribution: CountDistribution[]): number {
  const totalWeight = distribution.reduce((a, d) => a + d.weight, 0);
  return distribution.reduce((a, d) => a + (d.count * d.weight) / totalWeight, 0);
}

function pickRandom<T>(source: T[], rng: Rng): T {
  return source[rng.nextInt(source.length)];
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pickSubset<T>(source: T[], rng: Rng, distribution: CountDistribution[]): T[] {
  const count = pickCount(rng, distribution);
  return shuffle(source, rng).slice(0, Math.min(count, source.length));
}

function joinAllCombinations(first: string[], last: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < first.length * last.length; i++) {
    out.push(`${first[i % first.length]} ${last[Math.floor(i / first.length) % last.length]}`);
  }
  return out;
}

/** Next-or-same Monday, matching TemporalAdjusters.nextOrSame(DayOfWeek.MONDAY). */
export function nextOrSameMonday(from: Date = new Date()): IsoDate {
  const date = new Date(Date.UTC(from.getFullYear(), from.getMonth(), from.getDate()));
  const dow = date.getUTCDay(); // 0 = Sunday
  const daysUntilMonday = (8 - (dow === 0 ? 7 : dow)) % 7;
  date.setUTCDate(date.getUTCDate() + daysUntilMonday);
  return date.toISOString().slice(0, 10);
}

export function generateDemoData(
  parameters: DemoDataParameters,
  startDate: IsoDate = nextOrSameMonday(),
): EmployeeSchedule {
  const rng = createRandom(parameters.randomSeed);

  const locationToStartTimes = new Map<string, string[]>();
  let comboIndex = 0;
  for (const location of parameters.locations) {
    locationToStartTimes.set(location, SHIFT_START_TIME_COMBOS[comboIndex]);
    comboIndex = (comboIndex + 1) % SHIFT_START_TIME_COMBOS.length;
  }

  const namePermutations = shuffle(joinAllCombinations(FIRST_NAMES, LAST_NAMES), rng);

  const employees: Employee[] = [];
  for (let i = 0; i < parameters.employeeCount; i++) {
    const skills = new Set(pickSubset(parameters.optionalSkills, rng, parameters.optionalSkillDistribution));
    skills.add(pickRandom(parameters.requiredSkills, rng));
    employees.push({
      name: namePermutations[i % namePermutations.length],
      skills: [...skills],
      unavailableDates: [],
      undesiredDates: [],
      desiredDates: [],
    });
  }

  const shifts: Shift[] = [];
  for (let dayIndex = 0; dayIndex < parameters.daysInSchedule; dayIndex++) {
    const date = addDays(startDate, dayIndex);
    const employeesWithAvailability = pickSubset(
      employees,
      rng,
      parameters.availabilityCountDistribution,
    );
    for (const employee of employeesWithAvailability) {
      switch (rng.nextInt(3)) {
        case 0:
          employee.unavailableDates.push(date);
          break;
        case 1:
          employee.undesiredDates.push(date);
          break;
        default:
          employee.desiredDates.push(date);
          break;
      }
    }
    for (const location of parameters.locations) {
      for (const startTime of locationToStartTimes.get(location)!) {
        const shiftCount = pickCount(rng, parameters.shiftCountDistribution);
        for (let i = 0; i < shiftCount; i++) {
          const requiredSkill = rng.nextBoolean()
            ? pickRandom(parameters.requiredSkills, rng)
            : pickRandom(parameters.optionalSkills, rng);
          const startMs = Date.parse(`${date}T${startTime}:00Z`);
          const endMs = startMs + SHIFT_LENGTH_HOURS * 3600_000;
          shifts.push({
            id: String(shifts.length),
            start: new Date(startMs).toISOString().slice(0, 16),
            end: new Date(endMs).toISOString().slice(0, 16),
            location,
            requiredSkill,
            employee: null,
          });
        }
      }
    }
  }

  return { employees, shifts, solverStatus: "NOT_SOLVING" };
}

/**
 * Search for a seed whose generated instance has NO structural shortage — i.e. where
 * 0hard is actually reachable.
 *
 * This exists because the quickstart's own default (seed 0) generates an instance that
 * is over-constrained: on some days more shifts require a skill than there are
 * employees holding it and available. The solver is not failing when it stops at
 * -3hard there; the data is impossible. Being able to flip between an impossible
 * instance and a possible one, with the same solver, is the fastest way to internalise
 * the difference between "the search is weak" and "the problem is infeasible".
 *
 * `isFeasible` is injected to keep this module free of a dependency on feasibility.ts.
 */
export function findFeasibleSeed(
  parameters: DemoDataParameters,
  isFeasible: (schedule: EmployeeSchedule) => boolean,
  startDate?: IsoDate,
  maxAttempts = 200,
): number | null {
  for (let seed = 0; seed < maxAttempts; seed++) {
    if (isFeasible(generateDemoData({ ...parameters, randomSeed: seed }, startDate))) return seed;
  }
  return null;
}

/** Analytic prediction of the dataset size, before generating it. */
export function predictedShiftCount(parameters: DemoDataParameters): number {
  let timeslotsPerDay = 0;
  let comboIndex = 0;
  for (let i = 0; i < parameters.locations.length; i++) {
    timeslotsPerDay += SHIFT_START_TIME_COMBOS[comboIndex].length;
    comboIndex = (comboIndex + 1) % SHIFT_START_TIME_COMBOS.length;
  }
  return Math.round(
    timeslotsPerDay * parameters.daysInSchedule * expectedCount(parameters.shiftCountDistribution),
  );
}
