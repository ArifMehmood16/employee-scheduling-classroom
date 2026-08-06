/**
 * A real, working solver — construction heuristic followed by local search — with the
 * same architecture Timefold uses, at a scale you can read in one sitting.
 *
 * ===========================================================================
 * THE TWO PHASES
 * ===========================================================================
 * Phase 1: CONSTRUCTION HEURISTIC. Every shift starts unassigned. Assign them one at
 *   a time, never revisiting. Fast (|S| * |E| score evaluations) and gets you a
 *   complete, usually feasible solution. Timefold's default is
 *   ALLOCATE_ENTITY_FROM_QUEUE, whose default forager stops at the first value that
 *   does not worsen the score — i.e. FIRST_FIT with an early pick.
 *   Cannot escape its own greedy mistakes: it never undoes an assignment.
 *
 * Phase 2: LOCAL SEARCH. Repeatedly propose a small change (a "move"), score it, and
 *   accept or reject. This is where quality comes from, and where all the interesting
 *   mathematics lives.
 *
 * ===========================================================================
 * WHY INCREMENTAL SCORING IS THE WHOLE BALLGAME
 * ===========================================================================
 * Constraints 1-7 all filter on `shift.employee`, so the score is a sum over employees:
 *
 *     score(solution) = sum over e of f(e, shifts assigned to e)  -  unfairness(loads)
 *
 * A change move touches exactly two employees. So instead of recomputing all
 * O(sum_e k_e^2) pair terms, we recompute two of them:
 *
 *     full recalculation:        ~ |S|^2 / |E|   pair checks   (SMALL: ~1,500)
 *     incremental (2 employees): ~ 2 * k^2       pair checks   (SMALL: ~200)
 *
 * and the unfairness term updates in O(1), because moving one shift from employee a
 * to employee b changes the sum of squares by exactly
 *
 *     Delta(sum x^2) = ((x_a - 1)^2 - x_a^2) + ((x_b + 1)^2 - x_b^2)
 *                    = -2*x_a + 1 + 2*x_b + 1
 *                    = 2*(x_b - x_a + 1)
 *
 * with the total sum S unchanged. Set `scoreMode: "FULL"` to measure the difference
 * yourself — the Math Lab does exactly that and reports both moves/second figures.
 *
 * ===========================================================================
 * THE ACCEPTANCE RULE (this is the metaheuristic)
 * ===========================================================================
 * Pure hill climbing accepts only improvements, and therefore gets stuck at the first
 * local optimum. Every real metaheuristic is a rule for sometimes accepting a worse
 * solution. The four implemented here:
 *
 *   HILL_CLIMBING       accept iff newScore >= lastStepScore
 *   LATE_ACCEPTANCE     accept iff newScore >= score from L steps ago
 *                       (or, with hill climbing enabled, >= lastStepScore)
 *                       Timefold default: L = 400, hillClimbingEnabled = true
 *   SIMULATED_ANNEALING accept improvements always; accept a worsening of Delta with
 *                       probability exp(-Delta / T), T decaying over the time budget
 *   TABU_SEARCH         accept unless the touched entity is in the last k steps' tabu
 *                       list, with an aspiration override for new global bests
 *
 * Late acceptance is the default because it needs almost no tuning: the only knob is
 * L, and it self-calibrates — the acceptance bar is a real score the search achieved
 * L steps ago, so it tightens automatically as the search improves. Simulated
 * annealing's exp(-Delta/T) needs a starting temperature in the units of your score,
 * which changes with every dataset.
 */

import {
  deepCloneSchedule,
  toMillis,
  type Employee,
  type EmployeeSchedule,
  type HardSoftScore,
  type Shift,
} from "./domain";
import { ALL_ENABLED, evaluateSchedule, type ConstraintToggles } from "./constraints";
import { compareScore, isBetter, toSixSignificantDigits } from "./score";
import { createRandom } from "./demoData";
import {
  insertSorted,
  prepareSchedule,
  scoreEmployeeFast,
  type PreparedEmployee,
  type PreparedShift,
} from "./fastEval";

export type AcceptorType =
  | "LATE_ACCEPTANCE"
  | "HILL_CLIMBING"
  | "SIMULATED_ANNEALING"
  | "TABU_SEARCH";

export type ConstructionHeuristicType = "FIRST_FIT" | "BEST_FIT" | "NONE";

export type ScoreMode = "INCREMENTAL" | "FULL";

export interface SolverConfig {
  constructionHeuristic: ConstructionHeuristicType;
  acceptor: AcceptorType;
  /** Timefold default 400. */
  lateAcceptanceSize: number;
  /** Timefold default true. */
  hillClimbingEnabled: boolean;
  /** In soft-score units. Only used by SIMULATED_ANNEALING. */
  startingTemperature: number;
  tabuSize: number;
  /** Relative probability of drawing a change move vs a swap move. */
  changeMoveRatio: number;
  seed: number;
  toggles: ConstraintToggles;
  scoreMode: ScoreMode;
  /** Matches quarkus.timefold.solver.termination.spent-limit=30s */
  spentLimitMs: number;
  /** Optional extra termination: stop after this many unimproved steps. 0 = off. */
  unimprovedStepLimit: number;
  /** Safety valve: max moves sampled before forcing a step. */
  maxMovesPerStep: number;
}

export const DEFAULT_CONFIG: SolverConfig = {
  constructionHeuristic: "FIRST_FIT",
  acceptor: "LATE_ACCEPTANCE",
  lateAcceptanceSize: 400,
  hillClimbingEnabled: true,
  startingTemperature: 200,
  tabuSize: 7,
  changeMoveRatio: 0.6,
  seed: 0,
  toggles: ALL_ENABLED,
  scoreMode: "INCREMENTAL",
  spentLimitMs: 30_000,
  unimprovedStepLimit: 0,
  maxMovesPerStep: 400,
};

export type Move =
  | { type: "CHANGE"; shiftId: string; from: string | null; to: string }
  | { type: "SWAP"; shiftAId: string; shiftBId: string; employeeA: string | null; employeeB: string | null };

export function describeMove(move: Move): string {
  return move.type === "CHANGE"
    ? `Change shift ${move.shiftId}: ${move.from ?? "—"} → ${move.to}`
    : `Swap shifts ${move.shiftAId} ↔ ${move.shiftBId} (${move.employeeA ?? "—"} / ${move.employeeB ?? "—"})`;
}

export interface EvaluatedMove {
  move: Move;
  scoreBefore: HardSoftScore;
  scoreAfter: HardSoftScore;
  deltaHard: number;
  deltaSoft: number;
  accepted: boolean;
  /** Which acceptance clause fired. */
  reason: string;
}

export interface ScoreSample {
  elapsedMs: number;
  step: number;
  hard: number;
  soft: number;
  bestHard: number;
  bestSoft: number;
  movesEvaluated: number;
}

export interface SolverStats {
  phase: "NOT_STARTED" | "CONSTRUCTION" | "LOCAL_SEARCH" | "TERMINATED";
  step: number;
  movesEvaluated: number;
  movesAccepted: number;
  elapsedMs: number;
  score: HardSoftScore;
  bestScore: HardSoftScore;
  unimprovedSteps: number;
  movesPerSecond: number;
  /** Fraction of evaluated moves that were accepted. Healthy late acceptance sits low. */
  acceptanceRate: number;
  /** Shifts still holding a null planning variable. */
  unassignedCount: number;
}

interface ConstructionStep {
  shiftId: string;
  chosen: string;
  candidatesTried: number;
  score: HardSoftScore;
}

/**
 * Mirrors LateAcceptanceScoreBuffer: a circular buffer of the last L step scores.
 * `current()` is the score from L steps ago — the bar a move must clear.
 */
class LateAcceptanceBuffer {
  private buffer: HardSoftScore[];
  private index = 0;

  constructor(size: number, initial: HardSoftScore) {
    this.buffer = new Array(Math.max(1, size)).fill({ ...initial });
  }

  current(): HardSoftScore {
    return this.buffer[this.index];
  }

  update(stepScore: HardSoftScore): void {
    this.buffer[this.index] = { ...stepScore };
    this.index = (this.index + 1) % this.buffer.length;
  }
}

export class EmployeeSchedulingSolver {
  readonly schedule: EmployeeSchedule;
  config: SolverConfig;

  private employeeByName = new Map<string, Employee>();
  private shiftById = new Map<string, Shift>();
  /** Kept sorted by start time on insert, so the hot path never sorts. */
  private shiftsByEmployee = new Map<string, PreparedShift[]>();
  private employeeTerm = new Map<string, { hard: number; soft: number }>();
  private preparedShifts = new Map<string, PreparedShift>();
  private preparedEmployees = new Map<string, PreparedEmployee>();
  /** Reused scratch buffer — avoids one allocation per move evaluation. */
  private readonly scratch: [number, number] = [0, 0];

  private hardTotal = 0;
  private softFromEmployees = 0;

  // Load-balance accumulators, maintained in O(1) per move.
  private loadByEmployee = new Map<string, number>();
  private loadTotal = 0;
  private loadSumOfSquares = 0;

  private rng: ReturnType<typeof createRandom>;
  private lateBuffer: LateAcceptanceBuffer | null = null;
  private tabu: string[] = [];

  private lastStepScore: HardSoftScore = { hard: 0, soft: 0 };
  private best: {
    score: HardSoftScore;
    assignment: Array<string | null>;
    unassignedCount: number;
  };

  /**
   * Number of shifts with a null planning variable.
   *
   * This exists because of a trap that is easy to fall into when you write your own
   * solver: `forEach(Shift)` ignores unassigned shifts, so the EMPTY schedule scores a
   * flawless 0hard/0soft and looks like the global optimum. A naive "keep the best
   * score seen" would therefore latch onto the empty solution and throw away every
   * real schedule the search finds.
   *
   * Timefold's answer is an extra, dominating level: internally a solution carries an
   * `initScore` (negative = number of unassigned entities), and comparison is
   *
   *     (initScore, hard, soft)   lexicographically
   *
   * so ANY fully-assigned solution beats ANY partially-assigned one, regardless of
   * score. We replicate exactly that below.
   */
  private unassignedCount = 0;

  stats: SolverStats;
  history: ScoreSample[] = [];
  recentMoves: EvaluatedMove[] = [];
  constructionLog: ConstructionStep[] = [];

  private startedAt = 0;
  private accumulatedMs = 0;
  private running = false;

  constructor(schedule: EmployeeSchedule, config: Partial<SolverConfig> = {}) {
    this.schedule = deepCloneSchedule(schedule);
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.rng = createRandom(this.config.seed);

    const prepared = prepareSchedule(this.schedule);
    this.preparedShifts = prepared.preparedShifts;
    this.preparedEmployees = prepared.preparedEmployees;

    for (const employee of this.schedule.employees) {
      this.employeeByName.set(employee.name, employee);
      this.shiftsByEmployee.set(employee.name, []);
      this.employeeTerm.set(employee.name, { hard: 0, soft: 0 });
      this.loadByEmployee.set(employee.name, 0);
    }
    for (const shift of this.schedule.shifts) {
      this.shiftById.set(shift.id, shift);
      if (shift.employee != null) {
        const list = this.shiftsByEmployee.get(shift.employee);
        const preparedShift = this.preparedShifts.get(shift.id)!;
        if (list) insertSorted(list, preparedShift);
      }
    }
    this.recomputeEverything();

    this.best = {
      score: this.score(),
      assignment: this.schedule.shifts.map((s) => s.employee),
      unassignedCount: this.unassignedCount,
    };
    this.stats = {
      phase: "NOT_STARTED",
      step: 0,
      movesEvaluated: 0,
      movesAccepted: 0,
      elapsedMs: 0,
      score: this.score(),
      bestScore: this.best.score,
      unimprovedSteps: 0,
      movesPerSecond: 0,
      acceptanceRate: 0,
      unassignedCount: this.unassignedCount,
    };
  }

  // ------------------------------------------------------------------ scoring

  private recomputeEverything(): void {
    this.hardTotal = 0;
    this.softFromEmployees = 0;
    this.loadTotal = 0;
    this.loadSumOfSquares = 0;
    this.unassignedCount = this.schedule.shifts.reduce(
      (count, shift) => count + (shift.employee == null ? 1 : 0),
      0,
    );
    for (const [name, shifts] of this.shiftsByEmployee) {
      const prepared = this.preparedEmployees.get(name)!;
      scoreEmployeeFast(prepared, shifts, this.config.toggles, this.scratch);
      const term = { hard: this.scratch[0], soft: this.scratch[1] };
      this.employeeTerm.set(name, term);
      this.hardTotal += term.hard;
      this.softFromEmployees += term.soft;
      const load = shifts.length;
      this.loadByEmployee.set(name, load);
      this.loadTotal += load;
      this.loadSumOfSquares += load * load;
    }
  }

  /** unfairness = sqrt(sum x^2 - S^2/n), maintained from O(1) accumulators. */
  unfairness(): number {
    const n = this.schedule.employees.length;
    if (n === 0) return 0;
    const raw = this.loadSumOfSquares - (this.loadTotal * this.loadTotal) / n;
    return toSixSignificantDigits(Math.sqrt(Math.max(0, raw)));
  }

  score(): HardSoftScore {
    const balance = this.config.toggles.balanceEmployeeShiftAssignments
      ? this.unfairness()
      : 0;
    return {
      hard: this.hardTotal,
      soft: toSixSignificantDigits(this.softFromEmployees - balance),
    };
  }

  /** Recompute one employee's term and fold the difference into the running totals. */
  private refreshEmployee(name: string): void {
    const prepared = this.preparedEmployees.get(name);
    if (!prepared) return;
    const shifts = this.shiftsByEmployee.get(name)!;
    const previous = this.employeeTerm.get(name)!;
    scoreEmployeeFast(prepared, shifts, this.config.toggles, this.scratch);
    this.hardTotal += this.scratch[0] - previous.hard;
    this.softFromEmployees += this.scratch[1] - previous.soft;
    previous.hard = this.scratch[0];
    previous.soft = this.scratch[1];
  }

  private setShiftEmployee(shift: Shift, to: string | null): void {
    const from = shift.employee;
    if (from === to) return;
    const prepared = this.preparedShifts.get(shift.id)!;
    if (from == null && to != null) this.unassignedCount -= 1;
    else if (from != null && to == null) this.unassignedCount += 1;
    if (from != null) {
      const list = this.shiftsByEmployee.get(from);
      if (list) {
        const index = list.indexOf(prepared);
        if (index >= 0) list.splice(index, 1);
      }
      const load = (this.loadByEmployee.get(from) ?? 0) - 1;
      // Delta of sum(x^2): -old^2 + new^2, in O(1).
      this.loadSumOfSquares += load * load - (load + 1) * (load + 1);
      this.loadByEmployee.set(from, load);
      this.loadTotal -= 1;
    }
    shift.employee = to;
    if (to != null) {
      const list = this.shiftsByEmployee.get(to);
      if (list) insertSorted(list, prepared);
      const load = (this.loadByEmployee.get(to) ?? 0) + 1;
      this.loadSumOfSquares += load * load - (load - 1) * (load - 1);
      this.loadByEmployee.set(to, load);
      this.loadTotal += 1;
    }
  }

  private applyMove(move: Move): void {
    if (move.type === "CHANGE") {
      const shift = this.shiftById.get(move.shiftId)!;
      const from = shift.employee;
      this.setShiftEmployee(shift, move.to);
      if (from != null) this.refreshEmployee(from);
      this.refreshEmployee(move.to);
    } else {
      const a = this.shiftById.get(move.shiftAId)!;
      const b = this.shiftById.get(move.shiftBId)!;
      const employeeA = a.employee;
      const employeeB = b.employee;
      this.setShiftEmployee(a, employeeB);
      this.setShiftEmployee(b, employeeA);
      if (employeeA != null) this.refreshEmployee(employeeA);
      if (employeeB != null) this.refreshEmployee(employeeB);
    }
  }

  private undoMove(move: Move): void {
    if (move.type === "CHANGE") {
      // Undo can legitimately target null (back to unassigned), which the Move type
      // does not express, so restore directly rather than round-tripping through
      // applyMove.
      const shift = this.shiftById.get(move.shiftId)!;
      const current = shift.employee;
      this.setShiftEmployee(shift, move.from);
      if (current != null) this.refreshEmployee(current);
      if (move.from != null) this.refreshEmployee(move.from);
    } else {
      this.applyMove({
        type: "SWAP",
        shiftAId: move.shiftAId,
        shiftBId: move.shiftBId,
        employeeA: move.employeeB,
        employeeB: move.employeeA,
      });
    }
  }

  /** Full recalculation, for the FULL scoreMode benchmark and for verification. */
  private fullScore(): HardSoftScore {
    return evaluateSchedule(this.schedule, this.config.toggles, false).score;
  }

  // ------------------------------------------------- construction heuristic

  /**
   * FIRST_FIT: for each shift in order, try employees until one does not worsen the
   * score; if all worsen, keep the least-bad. BEST_FIT: always evaluate every
   * employee and take the best. FIRST_FIT is |S|*O(1) expected; BEST_FIT is |S|*|E|.
   */
  runConstructionHeuristic(): void {
    this.stats.phase = "CONSTRUCTION";
    if (this.config.constructionHeuristic === "NONE") return;
    const employeeNames = this.schedule.employees.map((e) => e.name);
    const firstFit = this.config.constructionHeuristic === "FIRST_FIT";

    for (const shift of this.schedule.shifts) {
      if (shift.employee != null) continue;
      const scoreBefore = this.score();
      let bestName: string | null = null;
      let bestScore: HardSoftScore | null = null;
      let tried = 0;

      for (const name of employeeNames) {
        tried++;
        this.applyMove({ type: "CHANGE", shiftId: shift.id, from: null, to: name });
        const candidate = this.score();
        this.stats.movesEvaluated++;
        if (bestScore === null || isBetter(candidate, bestScore)) {
          bestScore = candidate;
          bestName = name;
        }
        // Undo before trying the next candidate.
        this.setShiftEmployee(shift, null);
        this.refreshEmployee(name);

        // First non-deteriorating pick: the assignment adds no penalty at all.
        if (firstFit && compareScore(candidate, scoreBefore) >= 0) {
          bestScore = candidate;
          bestName = name;
          break;
        }
      }

      if (bestName != null) {
        this.applyMove({ type: "CHANGE", shiftId: shift.id, from: null, to: bestName });
        this.constructionLog.push({
          shiftId: shift.id,
          chosen: bestName,
          candidatesTried: tried,
          score: this.score(),
        });
      }
    }

    this.lastStepScore = this.score();
    // The construction heuristic's output is the local search's starting point and its
    // first "best", even though its raw score is worse than the empty solution's 0/0.
    this.captureBest(true);
    this.sample();
  }

  // ------------------------------------------------------------ local search

  private randomEmployeeName(exclude: string | null): string {
    const names = this.schedule.employees;
    for (let attempt = 0; attempt < 12; attempt++) {
      const candidate = names[this.rng.nextInt(names.length)].name;
      if (candidate !== exclude) return candidate;
    }
    return names[0].name;
  }

  private nextMove(): Move | null {
    const shifts = this.schedule.shifts;
    if (shifts.length === 0) return null;
    const wantChange = this.rng.next() < this.config.changeMoveRatio;

    if (wantChange) {
      const shift = shifts[this.rng.nextInt(shifts.length)];
      const to = this.randomEmployeeName(shift.employee);
      if (to === shift.employee) return null;
      return { type: "CHANGE", shiftId: shift.id, from: shift.employee, to };
    }

    for (let attempt = 0; attempt < 12; attempt++) {
      const a = shifts[this.rng.nextInt(shifts.length)];
      const b = shifts[this.rng.nextInt(shifts.length)];
      if (a.id !== b.id && a.employee !== b.employee) {
        return {
          type: "SWAP",
          shiftAId: a.id,
          shiftBId: b.id,
          employeeA: a.employee,
          employeeB: b.employee,
        };
      }
    }
    return null;
  }

  private isTabu(move: Move): boolean {
    if (this.config.acceptor !== "TABU_SEARCH") return false;
    const ids = move.type === "CHANGE" ? [move.shiftId] : [move.shiftAId, move.shiftBId];
    return ids.some((id) => this.tabu.includes(id));
  }

  /** The acceptance decision. Returns [accepted, reason]. */
  private accept(candidate: HardSoftScore, timeGradient: number): [boolean, string] {
    const cmpLastStep = compareScore(candidate, this.lastStepScore);

    switch (this.config.acceptor) {
      case "HILL_CLIMBING":
        return cmpLastStep >= 0
          ? [true, "not worse than the last step"]
          : [false, "worse than the last step"];

      case "LATE_ACCEPTANCE": {
        const late = this.lateBuffer!.current();
        if (compareScore(candidate, late) >= 0)
          return [true, `≥ score from ${this.config.lateAcceptanceSize} steps ago`];
        if (this.config.hillClimbingEnabled && cmpLastStep >= 0)
          return [true, "hill-climbing fallback: ≥ last step"];
        return [false, "worse than both the late score and the last step"];
      }

      case "SIMULATED_ANNEALING": {
        if (cmpLastStep >= 0) return [true, "improving or equal"];
        // Simplification: collapse the two levels into one magnitude, with hard
        // penalties weighted heavily. Timefold anneals each level separately.
        const hardDelta = this.lastStepScore.hard - candidate.hard;
        const softDelta = this.lastStepScore.soft - candidate.soft;
        const delta = hardDelta * 1000 + softDelta;
        const temperature = Math.max(
          1e-6,
          this.config.startingTemperature * (1 - timeGradient),
        );
        const probability = Math.exp(-delta / temperature);
        return this.rng.next() < probability
          ? [true, `annealed: exp(-${delta.toFixed(1)}/${temperature.toFixed(1)}) = ${probability.toFixed(3)}`]
          : [false, `rejected: p = ${probability.toFixed(4)}, T = ${temperature.toFixed(1)}`];
      }

      case "TABU_SEARCH": {
        if (this.isBetterThanBest(candidate, this.unassignedCount))
          return [true, "aspiration: new global best"];
        return cmpLastStep >= 0
          ? [true, "non-tabu and not worse"]
          : [false, "worse than the last step"];
      }
    }
  }

  /**
   * Comparison on (initScore, hard, soft), where initScore = -unassignedCount.
   * Fewer unassigned entities wins outright; only then does the score matter.
   */
  private isBetterThanBest(score: HardSoftScore, unassignedCount: number): boolean {
    if (unassignedCount !== this.best.unassignedCount)
      return unassignedCount < this.best.unassignedCount;
    return isBetter(score, this.best.score);
  }

  private captureBest(force = false): void {
    const current = this.score();
    if (force || this.isBetterThanBest(current, this.unassignedCount)) {
      this.best = {
        score: current,
        assignment: this.schedule.shifts.map((s) => s.employee),
        unassignedCount: this.unassignedCount,
      };
      this.stats.unimprovedSteps = 0;
      return;
    }
    this.stats.unimprovedSteps++;
  }

  private sample(): void {
    const score = this.score();
    this.history.push({
      elapsedMs: Math.round(this.elapsedMs()),
      step: this.stats.step,
      hard: score.hard,
      soft: score.soft,
      bestHard: this.best.score.hard,
      bestSoft: this.best.score.soft,
      movesEvaluated: this.stats.movesEvaluated,
    });
    if (this.history.length > 4000) this.history = this.history.filter((_, i) => i % 2 === 0);
  }

  /** One local-search step: sample moves until one is accepted (acceptedCountLimit = 1). */
  step(): EvaluatedMove | null {
    if (this.lateBuffer === null)
      this.lateBuffer = new LateAcceptanceBuffer(
        this.config.lateAcceptanceSize,
        this.score(),
      );

    const timeGradient = Math.min(1, this.elapsedMs() / this.config.spentLimitMs);
    const scoreBefore = this.score();

    for (let attempt = 0; attempt < this.config.maxMovesPerStep; attempt++) {
      const move = this.nextMove();
      if (!move) continue;
      if (this.isTabu(move)) continue;

      this.applyMove(move);
      const candidate = this.config.scoreMode === "FULL" ? this.fullScore() : this.score();
      this.stats.movesEvaluated++;

      const [accepted, reason] = this.accept(candidate, timeGradient);
      const evaluated: EvaluatedMove = {
        move,
        scoreBefore,
        scoreAfter: candidate,
        deltaHard: candidate.hard - scoreBefore.hard,
        deltaSoft: toSixSignificantDigits(candidate.soft - scoreBefore.soft),
        accepted,
        reason,
      };
      this.recentMoves.unshift(evaluated);
      if (this.recentMoves.length > 40) this.recentMoves.pop();

      if (accepted) {
        this.stats.movesAccepted++;
        this.stats.step++;
        this.lastStepScore = candidate;
        this.lateBuffer.update(candidate);
        if (this.config.acceptor === "TABU_SEARCH") {
          const ids = move.type === "CHANGE" ? [move.shiftId] : [move.shiftAId, move.shiftBId];
          this.tabu.push(...ids);
          while (this.tabu.length > this.config.tabuSize) this.tabu.shift();
        }
        this.captureBest();
        return evaluated;
      }

      this.undoMove(move);
    }
    return null;
  }

  // ------------------------------------------------------------- driving it

  private elapsedMs(): number {
    return this.running
      ? this.accumulatedMs + (performance.now() - this.startedAt)
      : this.accumulatedMs;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.startedAt = performance.now();
    if (this.stats.phase === "NOT_STARTED") {
      this.runConstructionHeuristic();
      this.stats.phase = "LOCAL_SEARCH";
    }
  }

  pause(): void {
    if (!this.running) return;
    this.accumulatedMs += performance.now() - this.startedAt;
    this.running = false;
  }

  isTerminated(): boolean {
    if (this.elapsedMs() >= this.config.spentLimitMs) return true;
    if (
      this.config.unimprovedStepLimit > 0 &&
      this.stats.unimprovedSteps >= this.config.unimprovedStepLimit
    )
      return true;
    return false;
  }

  /**
   * Run for at most `sliceMs` of wall clock. Called from an animation frame so the UI
   * stays responsive — the same cooperative-slicing idea as Timefold's move threads,
   * minus the threads.
   */
  runSlice(sliceMs: number): void {
    if (!this.running) return;
    const sliceStart = performance.now();
    let sampleCountdown = 0;
    while (performance.now() - sliceStart < sliceMs) {
      if (this.isTerminated()) {
        this.terminate();
        return;
      }
      this.step();
      if (++sampleCountdown >= 25) {
        sampleCountdown = 0;
        this.sample();
      }
    }
    this.refreshStats();
  }

  private refreshStats(): void {
    const elapsed = this.elapsedMs();
    this.stats.elapsedMs = Math.round(elapsed);
    this.stats.score = this.score();
    this.stats.bestScore = this.best.score;
    this.stats.movesPerSecond = elapsed > 0 ? (this.stats.movesEvaluated / elapsed) * 1000 : 0;
    this.stats.acceptanceRate =
      this.stats.movesEvaluated > 0 ? this.stats.movesAccepted / this.stats.movesEvaluated : 0;
    this.stats.unassignedCount = this.unassignedCount;
  }

  terminate(): void {
    this.pause();
    this.restoreBest();
    this.stats.phase = "TERMINATED";
    this.refreshStats();
    this.sample();
  }

  /** Local search's working solution can be worse than the best found; restore the best. */
  restoreBest(): void {
    this.schedule.shifts.forEach((shift, index) => {
      const target = this.best.assignment[index];
      if (shift.employee !== target) this.setShiftEmployee(shift, target);
    });
    this.recomputeEverything();
  }

  /** A snapshot for React state. */
  snapshot(): EmployeeSchedule {
    this.refreshStats();
    const clone = deepCloneSchedule(this.schedule);
    clone.score = this.score();
    clone.solverStatus = this.running ? "SOLVING_ACTIVE" : "NOT_SOLVING";
    return clone;
  }

  bestScore(): HardSoftScore {
    return this.best.score;
  }
}

/**
 * Benchmark harness for the Math Lab: how many moves per second does each scoring
 * strategy sustain on this dataset? Same moves, same seed, only the scoring differs.
 */
export function benchmarkScoreModes(
  schedule: EmployeeSchedule,
  toggles: ConstraintToggles,
  moveBudget = 3000,
): { incremental: number; full: number; speedup: number } {
  const measure = (scoreMode: ScoreMode): number => {
    const solver = new EmployeeSchedulingSolver(schedule, {
      scoreMode,
      toggles,
      seed: 42,
      spentLimitMs: Number.MAX_SAFE_INTEGER,
    });
    solver.runConstructionHeuristic();
    const start = performance.now();
    let moves = 0;
    while (moves < moveBudget) {
      solver.step();
      moves = solver.stats.movesEvaluated;
      if (performance.now() - start > 4000) break;
    }
    const elapsed = performance.now() - start;
    return elapsed > 0 ? (moves / elapsed) * 1000 : 0;
  };
  const incremental = measure("INCREMENTAL");
  const full = measure("FULL");
  return { incremental, full, speedup: full > 0 ? incremental / full : 0 };
}

/** Assign every shift to a uniformly random employee — the "before" picture. */
export function randomAssignment(
  schedule: EmployeeSchedule,
  seed = 1,
): EmployeeSchedule {
  const clone = deepCloneSchedule(schedule);
  const rng = createRandom(seed);
  for (const shift of clone.shifts) {
    shift.employee = clone.employees[rng.nextInt(clone.employees.length)].name;
  }
  return clone;
}

/** Sort helper used by the board. */
export function sortShifts(shifts: Shift[]): Shift[] {
  return [...shifts].sort((a, b) => toMillis(a.start) - toMillis(b.start));
}
