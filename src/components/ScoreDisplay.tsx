import { AlertTriangle, CheckCircle2, CircleSlash, Info } from "lucide-react";
import type { HardSoftScore } from "@/timefold/domain";
import { formatNumber, cn } from "@/lib/utils";

/**
 * Score readouts.
 *
 * The hard/soft colours come from the reserved STATUS palette (critical / warning),
 * never from a categorical series slot, and every one of them ships with both an icon
 * and a text label — so the meaning never rests on hue alone. That matters here more
 * than in a normal dashboard, because "hard" versus "soft" is the single distinction a
 * learner most needs to keep straight.
 */

export function ScoreLevel({
  label,
  value,
  level,
  hint,
  size = "md",
}: {
  label: string;
  value: number;
  level: "hard" | "soft";
  hint?: string;
  size?: "sm" | "md" | "lg";
}) {
  const isHard = level === "hard";
  const color = isHard ? "var(--status-critical)" : "var(--status-warning)";
  const Icon = isHard ? (value < 0 ? AlertTriangle : CheckCircle2) : Info;
  const valueClass =
    size === "lg" ? "text-3xl" : size === "sm" ? "text-base" : "text-xl";

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" style={{ color }} aria-hidden />
        {label}
      </div>
      <div className={cn("font-semibold tabular", valueClass)} style={{ color }}>
        {formatNumber(value, Number.isInteger(value) ? 0 : 2)}
      </div>
      {hint ? <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

export function ScorePill({
  score,
  className,
}: {
  score: HardSoftScore | undefined;
  className?: string;
}) {
  if (!score)
    return (
      <span className={cn("font-mono text-xs text-muted-foreground", className)}>
        not scored
      </span>
    );
  const feasible = score.hard >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-md border px-2.5 py-1 font-mono text-xs tabular",
        className,
      )}
    >
      {feasible ? (
        <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "var(--status-good)" }} aria-hidden />
      ) : (
        <AlertTriangle
          className="h-3.5 w-3.5"
          style={{ color: "var(--status-critical)" }}
          aria-hidden
        />
      )}
      <span style={{ color: "var(--status-critical)" }}>
        {formatNumber(score.hard)}hard
      </span>
      <span className="text-muted-foreground">/</span>
      <span style={{ color: "var(--status-warning)" }}>
        {formatNumber(score.soft, Number.isInteger(score.soft) ? 0 : 2)}soft
      </span>
    </span>
  );
}

export function FeasibilityBadge({
  hard,
  bound,
}: {
  hard: number;
  bound: number;
}) {
  if (hard >= 0)
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium"
        style={{ background: "color-mix(in srgb, var(--status-good) 16%, transparent)", color: "var(--status-good)" }}
      >
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
        Feasible — no hard violations
      </span>
    );
  if (hard === bound)
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium"
        style={{ background: "color-mix(in srgb, var(--status-serious) 16%, transparent)", color: "var(--status-serious)" }}
      >
        <CircleSlash className="h-3.5 w-3.5" aria-hidden />
        Optimal on the hard level — matches the provable bound
      </span>
    );
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium"
      style={{ background: "color-mix(in srgb, var(--status-critical) 16%, transparent)", color: "var(--status-critical)" }}
    >
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
      {Math.abs(hard - bound)} above the provable bound of {bound}
    </span>
  );
}

/** A labelled statistic. No chart — a single number is a stat tile, not a plot. */
export function StatTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-md border bg-background/50 p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{sub}</div> : null}
    </div>
  );
}
