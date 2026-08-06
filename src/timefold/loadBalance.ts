/**
 * Port of Timefold's DefaultLoadBalance — the machinery behind
 * `ConstraintCollectors.loadBalance(...)` and `LoadBalance::unfairness`.
 *
 * Java source: core/src/main/java/ai/timefold/solver/core/impl/score/stream/collector/DefaultLoadBalance.java
 *
 * ===========================================================================
 * WHAT unfairness() ACTUALLY IS
 * ===========================================================================
 * The Javadoc only says "dimensionless, lower is fairer". The source says more.
 * It maintains two running totals over the loads x_1..x_n:
 *
 *   squaredDeviationIntegralPart      accumulates   sum(x_i^2)
 *   squaredDeviationFractionNumerator accumulates   -(sum x_i)^2      [= -S^2]
 *
 * and then returns
 *
 *   unfairness = sqrt( fractionNumerator / n + integralPart )
 *              = sqrt( sum(x_i^2) - S^2 / n )
 *
 * By the computational formula for variance, sum(x_i^2) - S^2/n is exactly the
 * total sum of squared deviations from the mean:
 *
 *   sum (x_i - xbar)^2  =  sum x_i^2 - 2*xbar*sum x_i + n*xbar^2
 *                       =  sum x_i^2 - 2*(S/n)*S + n*(S/n)^2
 *                       =  sum x_i^2 - 2S^2/n + S^2/n
 *                       =  sum x_i^2 - S^2/n                            [QED]
 *
 * Therefore:
 *
 *   unfairness = sqrt( sum (x_i - xbar)^2 )  =  sigma_pop * sqrt(n)
 *
 * It is NOT the standard deviation. It is the *Euclidean distance* from the load
 * vector x to the perfectly balanced vector (xbar, xbar, ..., xbar) — i.e. the
 * L2 norm of the deviation vector. sigma = unfairness / sqrt(n).
 *
 * ===========================================================================
 * WHY SQUARED, AND WHY THAT MATTERS TO THE SOLVER
 * ===========================================================================
 * Suppose 10 shifts over 5 employees, so xbar = 2.
 *   A = (2,2,2,2,2)  -> deviations 0        -> unfairness 0
 *   B = (3,2,2,2,1)  -> deviations +1,0,0,0,-1 -> sqrt(2)  ~ 1.41421
 *   C = (6,1,1,1,1)  -> deviations +4,-1x4     -> sqrt(20) ~ 4.47214
 *
 * The sum of ABSOLUTE deviations would rank B at 2 and C at 8 — only 4x worse.
 * Squaring makes C 10x worse than B, so the solver is pushed hard against
 * outliers rather than being indifferent to how the imbalance is distributed.
 * With absolute deviations, "one person does everything" and "everyone slightly
 * off" can score identically; with squares they cannot.
 *
 * ===========================================================================
 * WHY IT IS RETURNED AS BigDecimal WITH 6 DIGITS
 * ===========================================================================
 * The penalty must be a *gradient*, not a plateau. If unfairness were rounded to
 * an integer, thousands of distinct load vectors would collapse onto the same
 * score, and local search would wander a flat landscape with no signal about
 * which direction is better. Six significant digits keeps 1.00000 and 1.00001
 * distinguishable, so a single shift moving between two employees still changes
 * the score and the solver can follow it. That is why the constraint uses
 * `penalizeBigDecimal` rather than `penalize`.
 */

import { toSixSignificantDigits } from "./score";

/**
 * Direct O(n) computation. Straightforward, and the reference implementation we
 * check the incremental version against.
 */
export function unfairnessDirect(loads: number[]): number {
  const n = loads.length;
  if (n === 0) return 0;
  const sum = loads.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  let sumSquaredDeviation = 0;
  for (const load of loads) {
    const deviation = load - mean;
    sumSquaredDeviation += deviation * deviation;
  }
  // Clamp: floating point can produce a tiny negative for perfectly balanced input.
  return toSixSignificantDigits(Math.sqrt(Math.max(0, sumSquaredDeviation)));
}

/** The computational-formula route: sqrt(sum(x^2) - S^2/n). Same answer, one pass. */
export function unfairnessComputationalFormula(loads: number[]): number {
  const n = loads.length;
  if (n === 0) return 0;
  let sum = 0;
  let sumOfSquares = 0;
  for (const load of loads) {
    sum += load;
    sumOfSquares += load * load;
  }
  return toSixSignificantDigits(Math.sqrt(Math.max(0, sumOfSquares - (sum * sum) / n)));
}

/** Population standard deviation of the loads. unfairness = sigma * sqrt(n). */
export function loadStandardDeviation(loads: number[]): number {
  const n = loads.length;
  if (n === 0) return 0;
  return unfairnessDirect(loads) / Math.sqrt(n);
}

/**
 * Faithful port of DefaultLoadBalance's *incremental* accumulator.
 *
 * This is the part that makes load balancing usable inside a solver doing 100k
 * score evaluations per second. It never re-reads the whole load vector: when one
 * item's load changes from x0 to x0', it applies a closed-form delta.
 *
 * The identity being maintained (from the Java comment, expanded):
 *
 *   integral    += x0'^2 - x0^2
 *   numerator   += 2*(sum - x0)*(S - S') + (S'^2 - S^2) + 2*(x0*S - x0'*S')
 *
 * where S is the old total and S' = S - x0 + x0'. Those two lines together
 * preserve  integral + numerator/n == sum(x_i^2) - S^2/n  after every update,
 * in O(1) time. The class-level test asserts this against unfairnessDirect.
 */
export class IncrementalLoadBalance {
  private loadByItem = new Map<string, number>();
  private registeredCount = new Map<string, number>();
  private sum = 0;
  private squaredDeviationIntegralPart = 0;
  private squaredDeviationFractionNumerator = 0;

  /** Mirrors registerBalanced(balanced, metricValue, initialMetricValue). */
  register(item: string, metricValue: number, initialMetricValue = 0): void {
    const count = (this.registeredCount.get(item) ?? 0) + 1;
    this.registeredCount.set(item, count);
    this.addToMetric(item, count === 1 ? metricValue + initialMetricValue : metricValue);
  }

  /** Mirrors unregisterBalanced(balanced, metricValue). */
  unregister(item: string, metricValue: number): void {
    const count = this.registeredCount.get(item) ?? 0;
    if (count <= 1) {
      this.registeredCount.delete(item);
      this.resetMetric(item);
    } else {
      this.registeredCount.set(item, count - 1);
      this.addToMetric(item, -metricValue);
    }
  }

  private addToMetric(item: string, diff: number): void {
    const oldValue = this.loadByItem.get(item) ?? 0;
    const newValue = oldValue + diff;
    this.loadByItem.set(item, newValue);
    if (oldValue !== newValue) {
      this.updateSquaredDeviation(oldValue, newValue);
      this.sum += diff;
    }
  }

  private resetMetric(item: string): void {
    const oldValue = this.loadByItem.get(item) ?? 0;
    this.loadByItem.delete(item);
    if (oldValue !== 0) {
      this.updateSquaredDeviation(oldValue, 0);
      this.sum -= oldValue;
    }
  }

  private updateSquaredDeviation(oldValue: number, newValue: number): void {
    const firstTerm = newValue * newValue - oldValue * oldValue;
    const secondTermFirstFactor = 2 * (this.sum - oldValue);
    const newSum = this.sum - oldValue + newValue;
    const secondTermSecondFactor = this.sum - newSum;
    const thirdTerm = newSum * newSum - this.sum * this.sum;
    const fourthTerm = 2 * (oldValue * this.sum - newValue * newSum);
    const secondTermNumerator =
      secondTermFirstFactor * secondTermSecondFactor + thirdTerm + fourthTerm;

    this.squaredDeviationIntegralPart += firstTerm;
    this.squaredDeviationFractionNumerator += secondTermNumerator;
  }

  loads(): Map<string, number> {
    return new Map(this.loadByItem);
  }

  /** Mirrors unfairness(): the only BigDecimal step in the Java is the final sqrt. */
  unfairness(): number {
    const n = this.registeredCount.size;
    if (n === 0) return 0;
    if (n === 1) {
      const total =
        this.squaredDeviationFractionNumerator + this.squaredDeviationIntegralPart;
      return toSixSignificantDigits(Math.sqrt(Math.max(0, total)));
    }
    const raw =
      this.squaredDeviationFractionNumerator / n + this.squaredDeviationIntegralPart;
    return toSixSignificantDigits(Math.sqrt(Math.max(0, raw)));
  }
}

/** Handy for the teaching UI: the deviation of each load from the mean. */
export interface LoadBreakdown {
  item: string;
  load: number;
  deviation: number;
  squaredDeviation: number;
}

export function loadBreakdown(loadMap: Map<string, number>): {
  rows: LoadBreakdown[];
  mean: number;
  total: number;
  sumSquaredDeviation: number;
  unfairness: number;
  stdDev: number;
} {
  const entries = [...loadMap.entries()];
  const loads = entries.map(([, load]) => load);
  const total = loads.reduce((a, b) => a + b, 0);
  const n = entries.length || 1;
  const mean = total / n;
  const rows = entries
    .map(([item, load]) => {
      const deviation = load - mean;
      return { item, load, deviation, squaredDeviation: deviation * deviation };
    })
    .sort((a, b) => b.load - a.load);
  const sumSquaredDeviation = rows.reduce((a, r) => a + r.squaredDeviation, 0);
  return {
    rows,
    mean,
    total,
    sumSquaredDeviation,
    unfairness: toSixSignificantDigits(Math.sqrt(Math.max(0, sumSquaredDeviation))),
    stdDev: Math.sqrt(Math.max(0, sumSquaredDeviation) / n),
  };
}
