/**
 * TypeScript port of the Timefold quickstart domain model.
 *
 * Java source: use-cases/employee-scheduling/src/main/java/org/acme/employeescheduling/domain/
 *
 * The Java model is annotation-driven. Those annotations are not decoration — each one
 * tells the solver something it cannot infer:
 *
 *   @PlanningSolution                 EmployeeSchedule  — the thing being optimised
 *   @PlanningEntityCollectionProperty List<Shift>       — what the solver may change
 *   @ProblemFactCollectionProperty    List<Employee>    — what it may not change
 *   @ValueRangeProvider               List<Employee>    — the domain of the planning variable
 *   @PlanningEntity                   Shift             — one changeable object
 *   @PlanningVariable                 Shift.employee    — THE single decision, repeated per shift
 *   @PlanningScore                    HardSoftBigDecimalScore
 *   @PlanningId                       Employee.name / Shift.id
 *
 * Because `Shift.employee` is the only planning variable, the entire search space is
 * "which employee goes in each shift slot" — see searchSpace.ts for the combinatorics.
 */

/** ISO date string, e.g. "2026-08-10". Stands in for Java LocalDate. */
export type IsoDate = string;

/** ISO local date-time string without zone, e.g. "2026-08-10T06:00". Stands in for LocalDateTime. */
export type IsoDateTime = string;

/** Mirrors Employee.java — a @ProblemFactCollectionProperty member. Immutable during solving. */
export interface Employee {
  /** @PlanningId */
  name: string;
  skills: string[];
  unavailableDates: IsoDate[];
  undesiredDates: IsoDate[];
  desiredDates: IsoDate[];
}

/** Mirrors Shift.java — the @PlanningEntity. `employee` is the @PlanningVariable. */
export interface Shift {
  /** @PlanningId */
  id: string;
  start: IsoDateTime;
  end: IsoDateTime;
  location: string;
  requiredSkill: string;
  /** @PlanningVariable — null means "not yet assigned" (uninitialised). */
  employee: string | null;
}

/** Mirrors EmployeeSchedule.java — the @PlanningSolution. */
export interface EmployeeSchedule {
  employees: Employee[];
  shifts: Shift[];
  score?: HardSoftScore;
  solverStatus?: SolverStatus;
}

export type SolverStatus = "NOT_SOLVING" | "SOLVING_SCHEDULED" | "SOLVING_ACTIVE";

/**
 * Mirrors HardSoftBigDecimalScore.
 *
 * Two independent levels. Comparison is LEXICOGRAPHIC, not additive: hard is compared
 * first and only if hard ties does soft matter. That is what makes hard constraints
 * genuinely inviolable rather than merely expensive. See score.ts.
 *
 * Both levels are non-positive in this model except for the "Desired day" reward, which
 * can push soft positive.
 */
export interface HardSoftScore {
  hard: number;
  soft: number;
}

// ---------------------------------------------------------------------------
// Time helpers. Java's java.time semantics matter here, so they are replicated
// deliberately rather than approximated — notably LocalTime.MAX and the
// truncating behaviour of ChronoUnit.MINUTES.
// ---------------------------------------------------------------------------

export const MINUTE_MS = 60_000;

/** Parse an ISO local date-time to epoch millis, treating it as UTC so arithmetic is zone-free. */
export function toMillis(dateTime: IsoDateTime): number {
  return Date.parse(`${dateTime}${dateTime.length === 16 ? ":00" : ""}Z`);
}

/** The date part of an ISO local date-time — Java's LocalDateTime.toLocalDate(). */
export function dateOf(dateTime: IsoDateTime): IsoDate {
  return dateTime.slice(0, 10);
}

/** Whole minutes between two instants, truncated toward zero — Java's ChronoUnit.MINUTES. */
export function minutesBetween(fromMs: number, toMs: number): number {
  return Math.trunc((toMs - fromMs) / MINUTE_MS);
}

/** Start of day: `LocalDateTime.of(date, LocalTime.MIN)` → 00:00:00.000000000 */
export function startOfDayMs(date: IsoDate): number {
  return Date.parse(`${date}T00:00:00Z`);
}

/**
 * `LocalDateTime.of(date, LocalTime.MAX)` is 23:59:59.999999999 — one NANOSECOND
 * short of the next midnight. We cannot represent that as an epoch-millisecond
 * float64: at ~1.79e12 ms the mantissa only resolves about 0.0005 ms, so
 * `nextMidnight - 0.000001` rounds straight back to `nextMidnight`.
 *
 * So instead of faking the nanosecond, we return the EXCLUSIVE upper bound
 * (next midnight) and carry the "minus one nanosecond" as a separate correction
 * applied at truncation time. That reproduces Java's arithmetic exactly rather
 * than approximately — see overlappingDurationInMinutes.
 *
 * Why it matters: a 22:00 → 06:00 night shift overlaps its first calendar day by
 * 119 minutes, not 120, because 22:00 → 23:59:59.999999999 is 119.99999... minutes
 * and ChronoUnit.MINUTES truncates toward zero.
 */
export function endOfDayExclusiveMs(date: IsoDate): number {
  return startOfDayMs(date) + 86_400_000;
}

/**
 * Truncated minutes, optionally shortened by one nanosecond first.
 * `Duration.between(a, b.minusNanos(1)).toMinutes()` without leaving float64.
 */
export function minutesBetweenMinusOneNano(
  fromMs: number,
  toMs: number,
  subtractOneNano: boolean,
): number {
  const diff = toMs - fromMs;
  if (diff <= 0) return 0;
  let minutes = Math.trunc(diff / MINUTE_MS);
  // One nanosecond only changes the truncated minute count when the raw difference
  // lands exactly on a minute boundary.
  if (subtractOneNano && diff % MINUTE_MS === 0) minutes -= 1;
  return minutes;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const ms = startOfDayMs(date) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Mirrors Shift.isOverlappingWithDate — note it only checks the START and END dates. */
export function isOverlappingWithDate(shift: Shift, date: IsoDate): boolean {
  return dateOf(shift.start) === date || dateOf(shift.end) === date;
}

/**
 * Mirrors Shift.getOverlappingDurationInMinutes(LocalDate). Never negative.
 *
 * Java:
 *   maxStartTime = max(dayStart, shiftStart)
 *   minEndTime   = min(dayEnd(23:59:59.999999999), shiftEnd)
 *   minutes      = ChronoUnit.MINUTES.between(maxStartTime, minEndTime)   // truncates
 */
export function overlappingDurationInMinutes(shift: Shift, date: IsoDate): number {
  const dayStart = startOfDayMs(date);
  const dayEndExclusive = endOfDayExclusiveMs(date);
  const shiftStart = toMillis(shift.start);
  const shiftEnd = toMillis(shift.end);

  const maxStart = Math.max(dayStart, shiftStart);
  // dayEnd < shiftEnd  <=>  shiftEnd >= nextMidnight (both are minute-aligned here).
  const clampedToDayEnd = shiftEnd >= dayEndExclusive;
  const minEnd = clampedToDayEnd ? dayEndExclusive : shiftEnd;

  return minutesBetweenMinusOneNano(maxStart, minEnd, clampedToDayEnd);
}

/** Mirrors EmployeeSchedulingConstraintProvider.getMinuteOverlap(Shift, Shift). */
export function minuteOverlap(a: Shift, b: Shift): number {
  const start = Math.max(toMillis(a.start), toMillis(b.start));
  const end = Math.min(toMillis(a.end), toMillis(b.end));
  return minutesBetween(start, end);
}

export function shiftDurationMinutes(shift: Shift): number {
  return minutesBetween(toMillis(shift.start), toMillis(shift.end));
}

/** "06:00" style label. */
export function timeLabel(dateTime: IsoDateTime): string {
  return dateTime.slice(11, 16);
}

export function deepCloneSchedule(schedule: EmployeeSchedule): EmployeeSchedule {
  return {
    employees: schedule.employees.map((e) => ({
      ...e,
      skills: [...e.skills],
      unavailableDates: [...e.unavailableDates],
      undesiredDates: [...e.undesiredDates],
      desiredDates: [...e.desiredDates],
    })),
    shifts: schedule.shifts.map((s) => ({ ...s })),
    score: schedule.score ? { ...schedule.score } : undefined,
    solverStatus: schedule.solverStatus,
  };
}

/** All distinct dates the schedule spans, ascending. */
export function scheduleDates(schedule: EmployeeSchedule): IsoDate[] {
  const set = new Set<IsoDate>();
  for (const shift of schedule.shifts) set.add(dateOf(shift.start));
  return [...set].sort();
}

export function scheduleLocations(schedule: EmployeeSchedule): string[] {
  return [...new Set(schedule.shifts.map((s) => s.location))];
}

export function allSkills(schedule: EmployeeSchedule): string[] {
  const set = new Set<string>();
  for (const e of schedule.employees) for (const s of e.skills) set.add(s);
  for (const s of schedule.shifts) set.add(s.requiredSkill);
  return [...set].sort();
}
