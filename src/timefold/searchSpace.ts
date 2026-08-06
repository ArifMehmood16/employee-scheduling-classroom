/**
 * The combinatorics of the problem. Everything here is computed in LOG10 space,
 * because the honest numbers overflow a float64 almost immediately.
 *
 * ===========================================================================
 * 1. THE RAW SEARCH SPACE
 * ===========================================================================
 * One planning variable per shift, each independently drawn from the employee list:
 *
 *     |searchSpace| = |E| ^ |S|
 *
 * For the SMALL dataset (15 employees, ~150 shifts):
 *
 *     15^150 = 10^(150 * log10 15) = 10^176.4
 *
 * There are roughly 10^80 atoms in the observable universe. If every atom were a
 * computer checking a billion schedules a second since the Big Bang (~4.4x10^17 s),
 * you would have checked about 10^80 * 10^9 * 10^17.6 = 10^106.6 schedules — about
 * one 10^70th of the space. Exhaustive search is not "slow"; it is not a thing.
 *
 * ===========================================================================
 * 2. THE FEASIBLE SPACE IS ALSO ENORMOUS
 * ===========================================================================
 * "Max one shift per day" turns each day into an injective assignment of that day's
 * k shifts to distinct employees — a k-permutation:
 *
 *     P(n, k) = n! / (n - k)!
 *
 * and days are independent for that constraint, so
 *
 *     |space respecting one-shift-per-day| = product over days of P(|E|, k_day)
 *
 * This is much smaller than |E|^|S| but still astronomically large. So the difficulty
 * is not "find a feasible solution" (a greedy heuristic does that in milliseconds) —
 * it is "find a good one among 10^150 feasible ones".
 *
 * ===========================================================================
 * 3. WHAT LOCAL SEARCH ACTUALLY EXAMINES
 * ===========================================================================
 * Per step it samples from a NEIGHBOURHOOD, not the space:
 *
 *     change moves = |S| * (|E| - 1)          reassign one shift
 *     swap moves   = C(|S|, 2) = |S|(|S|-1)/2  exchange two shifts' employees
 *
 * For SMALL that is 150*14 + 11175 = 13,275 neighbours — 10^4.1, versus 10^176 total.
 * A 30-second solve at ~50k moves/sec evaluates ~1.5x10^6 candidates: 10^6.2 out of
 * 10^176.4, i.e. a fraction of 10^-170. The reason that works at all is that the
 * score function is not a black box — it is a SUM OF LOCAL TERMS, so the landscape
 * has exploitable structure and gradient-following gets close to optimal.
 *
 * ===========================================================================
 * 4. COMPLEXITY CLASS (the honest framing)
 * ===========================================================================
 * Employee shift scheduling with skill requirements and rest rules is NP-hard: it
 * contains as a special case the problem of packing shifts into people subject to
 * conflict constraints, which is graph colouring in disguise (shifts = vertices,
 * "cannot share an employee" = edges, employees = colours). No polynomial algorithm
 * is known and none is expected. Hence metaheuristics: give up on proving optimality,
 * get a very good answer inside a time budget you choose.
 */

import type { EmployeeSchedule } from "./domain";
import { dateOf } from "./domain";

export interface SearchSpaceStats {
  employeeCount: number;
  shiftCount: number;
  /** log10 of |E| ^ |S| */
  rawLog10: number;
  /** log10 of the product of P(|E|, k_day) over days */
  oneShiftPerDayLog10: number;
  /** log10 of the space if only skill-compatible employees are considered per shift */
  skillFeasibleLog10: number;
  changeMoveCount: number;
  swapMoveCount: number;
  neighbourhoodSize: number;
  shiftsPerDay: Array<{ date: string; count: number }>;
  /** log10 of seconds to brute force at 1e9 evals/sec */
  bruteForceLog10Seconds: number;
}

/**
 * log10(n!).
 *
 * Exact summation for small n — Stirling's approximation is off by ~5e-5 in log10 at
 * n = 5, which is visible when you check P(5,2) = 20 by hand and get 20.000056. For
 * a teaching tool that discrepancy is worse than the extra loop. Above the cutoff the
 * Stirling series is accurate to far more digits than we display.
 */
const LOG10_FACTORIAL_EXACT_CUTOFF = 1000;

export function log10Factorial(n: number): number {
  if (n < 2) return 0;
  if (n <= LOG10_FACTORIAL_EXACT_CUTOFF) {
    let sum = 0;
    for (let i = 2; i <= n; i++) sum += Math.log10(i);
    return sum;
  }
  const lnFactorial =
    n * Math.log(n) -
    n +
    0.5 * Math.log(2 * Math.PI * n) +
    1 / (12 * n) -
    1 / (360 * n * n * n);
  return lnFactorial / Math.LN10;
}

/** log10 of P(n, k) = n! / (n-k)!  — the number of injective maps from k shifts to n employees. */
export function log10Permutations(n: number, k: number): number {
  if (k > n) return Number.NEGATIVE_INFINITY; // impossible: more shifts than employees that day
  return log10Factorial(n) - log10Factorial(n - k);
}

/** log10 of C(n, k). */
export function log10Combinations(n: number, k: number): number {
  if (k < 0 || k > n) return Number.NEGATIVE_INFINITY;
  return log10Factorial(n) - log10Factorial(k) - log10Factorial(n - k);
}

export function computeSearchSpace(schedule: EmployeeSchedule): SearchSpaceStats {
  const employeeCount = schedule.employees.length;
  const shiftCount = schedule.shifts.length;

  const rawLog10 = shiftCount * Math.log10(Math.max(1, employeeCount));

  const perDay = new Map<string, number>();
  for (const shift of schedule.shifts) {
    const date = dateOf(shift.start);
    perDay.set(date, (perDay.get(date) ?? 0) + 1);
  }
  const shiftsPerDay = [...perDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  let oneShiftPerDayLog10 = 0;
  for (const { count } of shiftsPerDay) {
    const value = log10Permutations(employeeCount, count);
    if (!Number.isFinite(value)) {
      oneShiftPerDayLog10 = Number.NEGATIVE_INFINITY;
      break;
    }
    oneShiftPerDayLog10 += value;
  }

  // Skill-feasible: product over shifts of |{employees holding requiredSkill}|
  let skillFeasibleLog10 = 0;
  const skilledCount = new Map<string, number>();
  for (const shift of schedule.shifts) {
    let count = skilledCount.get(shift.requiredSkill);
    if (count === undefined) {
      count = schedule.employees.filter((e) => e.skills.includes(shift.requiredSkill)).length;
      skilledCount.set(shift.requiredSkill, count);
    }
    skillFeasibleLog10 += Math.log10(Math.max(1, count));
  }

  const changeMoveCount = shiftCount * Math.max(0, employeeCount - 1);
  const swapMoveCount = (shiftCount * (shiftCount - 1)) / 2;

  return {
    employeeCount,
    shiftCount,
    rawLog10,
    oneShiftPerDayLog10,
    skillFeasibleLog10,
    changeMoveCount,
    swapMoveCount,
    neighbourhoodSize: changeMoveCount + swapMoveCount,
    shiftsPerDay,
    bruteForceLog10Seconds: rawLog10 - 9,
  };
}

/** Render 10^176.4 as "1.6 x 10^176" — a mantissa the eye can hold on to. */
export function formatLog10(log10Value: number): string {
  if (!Number.isFinite(log10Value)) return "0 (infeasible)";
  if (log10Value < 6) return Math.round(Math.pow(10, log10Value)).toLocaleString();
  const exponent = Math.floor(log10Value);
  const mantissa = Math.pow(10, log10Value - exponent);
  return `${mantissa.toFixed(2)} × 10^${exponent}`;
}

/** Human time from a log10 number of seconds. */
export function formatLog10Seconds(log10Seconds: number): string {
  const AGE_OF_UNIVERSE_SECONDS_LOG10 = Math.log10(4.35e17);
  if (log10Seconds < 0) return "under a second";
  if (log10Seconds < 2) return `${Math.pow(10, log10Seconds).toFixed(0)} seconds`;
  if (log10Seconds < 4.7) return `${(Math.pow(10, log10Seconds) / 60).toFixed(1)} minutes`;
  if (log10Seconds < 7.5) return `${(Math.pow(10, log10Seconds) / 86400).toFixed(1)} days`;
  if (log10Seconds < 10) return `${(Math.pow(10, log10Seconds) / 3.156e7).toFixed(1)} years`;
  const universes = log10Seconds - AGE_OF_UNIVERSE_SECONDS_LOG10;
  if (universes < 0) return `${(Math.pow(10, log10Seconds) / 3.156e7).toExponential(2)} years`;
  return `${formatLog10(universes)} × the age of the universe`;
}

/** Anchors for the "how big is that" comparison strip. */
export const MAGNITUDE_ANCHORS: Array<{ label: string; log10: number; note: string }> = [
  { label: "Grains of sand on Earth", log10: 19, note: "~7.5 × 10^18" },
  { label: "Stars in the observable universe", log10: 24, note: "~10^24" },
  { label: "Atoms in the observable universe", log10: 80, note: "~10^80" },
  { label: "Legal chess positions", log10: 44, note: "Shannon number ~10^43-10^44" },
  { label: "Chess game tree", log10: 120, note: "~10^120" },
  { label: "Go positions (19×19)", log10: 170, note: "~2.1 × 10^170" },
];
