/**
 * The FAST score evaluator. Same arithmetic as constraints.ts, ~20x the throughput.
 *
 * Keeping both is the point. Timefold ships the same duality:
 *
 *   EasyScoreCalculator      readable, recomputes everything, for correctness
 *   Constraint Streams       indexed, incremental, for the 100k-moves-per-second loop
 *
 * and the recommended workflow is to write the easy one first and use it to verify the
 * fast one. `engine.test.ts` does exactly that: it asserts the two agree on thousands
 * of random states. If they ever diverge, the readable one is right by definition.
 *
 * WHERE THE SPEED COMES FROM — four changes, no algorithmic magic:
 *
 * 1. PRECOMPUTATION. Parsing "2026-08-10T06:00" into epoch millis, and computing a
 *    shift's overlap with its own start/end date, are properties of the SHIFT, not of
 *    the assignment. They never change while solving, so they are computed once.
 *
 * 2. SETS INSTEAD OF ARRAYS. `employee.skills.includes(s)` is O(|skills|) and
 *    `unavailableDates` is scanned per shift. Hashing makes both O(1). This is the
 *    same idea as a constraint-stream JOINER versus a FILTER: build an index once,
 *    probe it many times.
 *
 * 3. AN EARLY BREAK IN THE PAIR LOOP. With shifts kept sorted by start time, once
 *    b.start is far enough past a.end no later b can overlap a, violate a's rest
 *    window, or share a's start date. Breaking there turns the O(k^2) pair scan into
 *    roughly O(k * c) with c a small constant, because an employee's ~10 shifts are
 *    spread over 14 days and almost no pairs are near each other.
 *
 *    The break threshold must be provably safe, so it is the LATER of:
 *      a.end + 10h        (beyond this, no overlap and no rest violation)
 *      midnight after a.start  (beyond this, no shared start date)
 *
 * 4. NO ALLOCATION IN THE HOT PATH. No arrays, no closures, no sorting per call.
 *
 * 5. ONLY TWO DATES CAN MATTER for availability. `Shift.isOverlappingWithDate` checks
 *    only `start.toLocalDate()` and `end.toLocalDate()`, so a shift has at most two
 *    relevant (date, minutes) pairs. Precompute them and the flattenLast/filter
 *    pipeline collapses to two hash probes.
 */

import {
  dateOf,
  overlappingDurationInMinutes,
  startOfDayMs,
  toMillis,
  type Employee,
  type EmployeeSchedule,
  type Shift,
} from "./domain";
import type { ConstraintToggles } from "./constraints";

const TEN_HOURS_MS = 10 * 60 * 60 * 1000;
const TEN_HOURS_MINUTES = 600;

/** Everything about a shift that does not depend on who is assigned to it. */
export interface PreparedShift {
  shift: Shift;
  startMs: number;
  endMs: number;
  startDate: string;
  /** Provably safe cut-off for the inner pair loop. */
  pairWindowEndMs: number;
  /** At most two (date, overlapMinutes) entries. */
  dateA: string;
  minutesA: number;
  dateB: string | null;
  minutesB: number;
}

export interface PreparedEmployee {
  employee: Employee;
  skills: Set<string>;
  unavailable: Set<string>;
  undesired: Set<string>;
  desired: Set<string>;
  hasDatePreferences: boolean;
}

export function prepareShift(shift: Shift): PreparedShift {
  const startMs = toMillis(shift.start);
  const endMs = toMillis(shift.end);
  const startDate = dateOf(shift.start);
  const endDate = dateOf(shift.end);
  const midnightAfterStart = startOfDayMs(startDate) + 86_400_000;
  return {
    shift,
    startMs,
    endMs,
    startDate,
    pairWindowEndMs: Math.max(endMs + TEN_HOURS_MS, midnightAfterStart),
    dateA: startDate,
    minutesA: overlappingDurationInMinutes(shift, startDate),
    dateB: endDate === startDate ? null : endDate,
    minutesB: endDate === startDate ? 0 : overlappingDurationInMinutes(shift, endDate),
  };
}

export function prepareEmployee(employee: Employee): PreparedEmployee {
  return {
    employee,
    skills: new Set(employee.skills),
    unavailable: new Set(employee.unavailableDates),
    undesired: new Set(employee.undesiredDates),
    desired: new Set(employee.desiredDates),
    hasDatePreferences:
      employee.unavailableDates.length > 0 ||
      employee.undesiredDates.length > 0 ||
      employee.desiredDates.length > 0,
  };
}

/**
 * Score one employee's assigned shifts. `shifts` MUST be sorted ascending by startMs;
 * the caller maintains that invariant on insert, so no sort happens here.
 *
 * Writes into the two-element `out` array to avoid allocating a result object per call
 * — at a million calls per solve that allocation is measurable.
 */
export function scoreEmployeeFast(
  prepared: PreparedEmployee,
  shifts: PreparedShift[],
  toggles: ConstraintToggles,
  out: [number, number],
): void {
  let hard = 0;
  let soft = 0;
  const count = shifts.length;

  const checkSkill = toggles.requiredSkill;
  const checkOverlap = toggles.noOverlappingShifts;
  const checkRest = toggles.atLeast10HoursBetweenTwoShifts;
  const checkOnePerDay = toggles.oneShiftPerDay;
  const checkUnavailable = toggles.unavailableEmployee;
  const checkUndesired = toggles.undesiredDayForEmployee;
  const checkDesired = toggles.desiredDayForEmployee;
  const anyDateRule = checkUnavailable || checkUndesired || checkDesired;
  const needPairs = checkOverlap || checkRest || checkOnePerDay;

  for (let i = 0; i < count; i++) {
    const a = shifts[i];

    // --- 1. Missing required skill -------------------------------------
    if (checkSkill && !prepared.skills.has(a.shift.requiredSkill)) hard -= 1;

    // --- 5, 6, 7. Date preferences: at most two hash probes per date ----
    if (anyDateRule && prepared.hasDatePreferences) {
      if (a.minutesA > 0) {
        if (checkUnavailable && prepared.unavailable.has(a.dateA)) hard -= a.minutesA;
        if (checkUndesired && prepared.undesired.has(a.dateA)) soft -= a.minutesA;
        if (checkDesired && prepared.desired.has(a.dateA)) soft += a.minutesA;
      }
      if (a.dateB !== null && a.minutesB > 0) {
        if (checkUnavailable && prepared.unavailable.has(a.dateB)) hard -= a.minutesB;
        if (checkUndesired && prepared.undesired.has(a.dateB)) soft -= a.minutesB;
        if (checkDesired && prepared.desired.has(a.dateB)) soft += a.minutesB;
      }
    }

    if (!needPairs) continue;

    // --- 2, 3, 4. Pairwise, with the early break ------------------------
    for (let j = i + 1; j < count; j++) {
      const b = shifts[j];
      if (b.startMs >= a.pairWindowEndMs) break;

      // 2. Overlapping shift — strict overlap, penalised by minutes.
      if (checkOverlap && a.startMs < b.endMs && b.startMs < a.endMs) {
        const overlapEnd = a.endMs < b.endMs ? a.endMs : b.endMs;
        const overlapStart = a.startMs > b.startMs ? a.startMs : b.startMs;
        const overlap = Math.trunc((overlapEnd - overlapStart) / 60_000);
        if (overlap > 0) hard -= overlap;
      }

      // 3. At least 10 hours between two shifts.
      if (checkRest && a.endMs <= b.startMs) {
        const gapMinutes = Math.trunc((b.startMs - a.endMs) / 60_000);
        if (Math.floor(gapMinutes / 60) < 10) hard -= TEN_HOURS_MINUTES - gapMinutes;
      }

      // 4. Max one shift per day — start dates only.
      if (checkOnePerDay && a.startDate === b.startDate) hard -= 1;
    }
  }

  out[0] = hard;
  out[1] = soft;
}

export function prepareSchedule(schedule: EmployeeSchedule): {
  preparedShifts: Map<string, PreparedShift>;
  preparedEmployees: Map<string, PreparedEmployee>;
} {
  const preparedShifts = new Map<string, PreparedShift>();
  for (const shift of schedule.shifts) preparedShifts.set(shift.id, prepareShift(shift));
  const preparedEmployees = new Map<string, PreparedEmployee>();
  for (const employee of schedule.employees)
    preparedEmployees.set(employee.name, prepareEmployee(employee));
  return { preparedShifts, preparedEmployees };
}

/** Insert into an array kept sorted by startMs. O(k) worst case, k ~ 10. */
export function insertSorted(list: PreparedShift[], item: PreparedShift): void {
  let index = list.length;
  while (index > 0 && list[index - 1].startMs > item.startMs) index--;
  list.splice(index, 0, item);
}
