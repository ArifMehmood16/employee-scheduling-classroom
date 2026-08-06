/**
 * How do you know whether the solver did well?
 *
 * "It reached -3hard" is meaningless on its own. Maybe the optimum is 0 and the search
 * is weak; maybe the optimum is -3 and the search is perfect. Without a LOWER BOUND you
 * cannot tell — and this is the single most common way people misjudge an optimiser.
 *
 * For this model we can prove a bound, exactly, in polynomial time.
 *
 * ===========================================================================
 * THE ARGUMENT
 * ===========================================================================
 * "Max one shift per day" means that within a single calendar day, the assignment of
 * that day's shifts to employees must be INJECTIVE — no employee twice. Call an
 * assignment "free" if it incurs no hard penalty at all: the employee holds the
 * required skill and has not marked the day unavailable.
 *
 * So for each day d, build a bipartite graph:
 *     left  = shifts starting on day d
 *     right = employees
 *     edge (s, e) iff e has s.requiredSkill AND d is not in e.unavailableDates
 *
 * A zero-hard-cost schedule for day d exists if and only if this graph has a PERFECT
 * MATCHING saturating the shifts. By Hall's marriage theorem that happens iff every
 * set S of shifts satisfies |N(S)| >= |S|. When it fails, the DEFICIENCY VERSION of
 * the theorem gives the exact shortfall:
 *
 *     maximum matching size = |shifts| - max over S of ( |S| - |N(S)| )
 *
 * Every unmatched shift must break at least one hard constraint, costing at least 1
 * (the cheapest hard violation in this model is a flat-weight skill mismatch). And
 * days are independent under one-shift-per-day. Therefore
 *
 *     best possible hard score <= - sum over days of deficiency(d)
 *
 * That is a genuine, provable bound. If the solver hits it, the solver is optimal on
 * the hard level and no amount of extra time will help.
 *
 * It is a bound, not the optimum: the 10-hour rest constraint couples adjacent days
 * and can force additional violations that this per-day relaxation cannot see. So the
 * true optimum is somewhere in [bound, solverResult].
 *
 * ===========================================================================
 * WHY MAX MATCHING IS EASY WHEN THE FULL PROBLEM IS NP-HARD
 * ===========================================================================
 * Bipartite matching is polynomial (Kuhn's augmenting-path algorithm below is
 * O(V*E)). Relaxing the problem — dropping the rest constraint and the soft level,
 * keeping only one-shift-per-day plus skills plus availability — lands in a tractable
 * class. This is the standard optimisation move: solve a relaxation to bound the
 * original. It is also why the solver is not "just brute force with extra steps":
 * structure is exploitable, you just cannot exploit all of it at once.
 */

import { dateOf, type EmployeeSchedule, type Shift } from "./domain";

export interface DayFeasibility {
  date: string;
  shiftCount: number;
  /** Largest set of shifts simultaneously assignable at zero hard cost. */
  maxMatching: number;
  /** shiftCount - maxMatching: shifts that MUST break a hard constraint. */
  deficiency: number;
  /** Per-skill supply/demand, the usual culprit. */
  skillPressure: Array<{ skill: string; demand: number; supply: number }>;
}

export interface FeasibilityReport {
  days: DayFeasibility[];
  /** Provable upper bound on the best achievable hard score (<= 0). */
  hardScoreUpperBound: number;
  totalDeficiency: number;
  feasible: boolean;
}

/**
 * Kuhn's algorithm for maximum bipartite matching.
 * `adjacency[i]` lists the employee indices that shift i may take at zero hard cost.
 */
export function maxBipartiteMatching(adjacency: number[][], rightCount: number): number {
  const matchOfRight = new Array<number>(rightCount).fill(-1);
  let matchingSize = 0;

  const tryAugment = (left: number, seen: boolean[]): boolean => {
    for (const right of adjacency[left]) {
      if (seen[right]) continue;
      seen[right] = true;
      if (matchOfRight[right] === -1 || tryAugment(matchOfRight[right], seen)) {
        matchOfRight[right] = left;
        return true;
      }
    }
    return false;
  };

  for (let left = 0; left < adjacency.length; left++) {
    const seen = new Array<boolean>(rightCount).fill(false);
    if (tryAugment(left, seen)) matchingSize++;
  }
  return matchingSize;
}

export function analyseFeasibility(schedule: EmployeeSchedule): FeasibilityReport {
  const shiftsByDate = new Map<string, Shift[]>();
  for (const shift of schedule.shifts) {
    const date = dateOf(shift.start);
    const list = shiftsByDate.get(date);
    if (list) list.push(shift);
    else shiftsByDate.set(date, [shift]);
  }

  const employees = schedule.employees;
  const days: DayFeasibility[] = [];

  for (const [date, shifts] of [...shiftsByDate.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const adjacency = shifts.map((shift) => {
      const candidates: number[] = [];
      employees.forEach((employee, index) => {
        if (
          employee.skills.includes(shift.requiredSkill) &&
          !employee.unavailableDates.includes(date)
        )
          candidates.push(index);
      });
      return candidates;
    });

    const maxMatching = maxBipartiteMatching(adjacency, employees.length);

    const skills = [...new Set(shifts.map((s) => s.requiredSkill))];
    const skillPressure = skills
      .map((skill) => ({
        skill,
        demand: shifts.filter((s) => s.requiredSkill === skill).length,
        supply: employees.filter(
          (e) => e.skills.includes(skill) && !e.unavailableDates.includes(date),
        ).length,
      }))
      .sort((a, b) => b.demand - b.supply - (a.demand - a.supply));

    days.push({
      date,
      shiftCount: shifts.length,
      maxMatching,
      deficiency: shifts.length - maxMatching,
      skillPressure,
    });
  }

  const totalDeficiency = days.reduce((sum, day) => sum + day.deficiency, 0);
  return {
    days,
    totalDeficiency,
    hardScoreUpperBound: -totalDeficiency,
    feasible: totalDeficiency === 0,
  };
}
