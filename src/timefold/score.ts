/**
 * HardSoftScore arithmetic — the port of HardSoftBigDecimalScore.
 *
 * THE ONE IDEA THAT MATTERS: comparison is lexicographic.
 *
 *   compare(a, b) = sign(a.hard - b.hard)  if a.hard != b.hard
 *                 = sign(a.soft - b.soft)  otherwise
 *
 * A score of -1hard/+1000000soft is WORSE than 0hard/-9999soft. No amount of soft
 * reward can buy off a single unit of hard penalty. This is a *hierarchy*, not a
 * weighted sum, and it is why you never have to invent a magic "big enough" weight
 * for hard constraints the way you would in a single-objective formulation.
 *
 * Formally: scores are ordered by the lexicographic order on Z x R, which is a total
 * order but is NOT Archimedean — there is no integer k with k * (0, 1) > (1, 0).
 * That non-Archimedean property is exactly the "inviolable" semantics we want.
 */

import type { HardSoftScore } from "./domain";

export const ZERO_SCORE: HardSoftScore = { hard: 0, soft: 0 };

export function scoreOf(hard: number, soft: number): HardSoftScore {
  return { hard, soft };
}

export function addScore(a: HardSoftScore, b: HardSoftScore): HardSoftScore {
  return { hard: a.hard + b.hard, soft: a.soft + b.soft };
}

export function subtractScore(a: HardSoftScore, b: HardSoftScore): HardSoftScore {
  return { hard: a.hard - b.hard, soft: a.soft - b.soft };
}

/** Lexicographic: hard level dominates absolutely. Returns >0 if a is better than b. */
export function compareScore(a: HardSoftScore, b: HardSoftScore): number {
  if (a.hard !== b.hard) return a.hard - b.hard;
  const softDiff = a.soft - b.soft;
  // Guard against float dust from the unfairness term.
  return Math.abs(softDiff) < 1e-9 ? 0 : softDiff;
}

export function isBetter(a: HardSoftScore, b: HardSoftScore): boolean {
  return compareScore(a, b) > 0;
}

export function isFeasible(score: HardSoftScore): boolean {
  return score.hard >= 0;
}

/** Timefold's DefaultLoadBalance returns 6 significant digits (MathContext(6, HALF_EVEN)). */
export function toSixSignificantDigits(value: number): number {
  if (value === 0 || !Number.isFinite(value)) return 0;
  const magnitude = Math.floor(Math.log10(Math.abs(value)));
  const factor = Math.pow(10, 5 - magnitude);
  return Math.round(value * factor) / factor;
}

function formatLevel(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(toSixSignificantDigits(value));
}

/** Renders like Timefold logs it: "-3hard/-1250.42soft". */
export function formatScore(score: HardSoftScore | undefined): string {
  if (!score) return "—";
  return `${formatLevel(score.hard)}hard/${formatLevel(score.soft)}soft`;
}

export function formatScoreShort(score: HardSoftScore | undefined): string {
  if (!score) return "—";
  return `${formatLevel(score.hard)} / ${formatLevel(score.soft)}`;
}
