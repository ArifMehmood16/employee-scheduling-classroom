import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ScoreSample } from "@/timefold/solver";
import { formatNumber } from "@/lib/utils";

/**
 * Hard and soft score over time.
 *
 * Deliberately TWO charts, not one with two y-axes. Hard score lives in the tens and
 * soft score in the thousands; putting them on a shared axis would flatten hard to a
 * dead line, and giving them separate y-axes on one plot is the single most misleading
 * thing you can do to a reader — the crossing point of the two lines would be an
 * artefact of the scaling choice, not a fact about the solve. Small multiples keep
 * both readable and make no false claim about their relationship.
 *
 * It also happens to mirror the mathematics: hard and soft are separate levels of a
 * lexicographic order, not two components of one quantity.
 */

interface Props {
  history: ScoreSample[];
  /** "elapsedMs" for wall-clock, "step" for algorithmic time. */
  xKey?: "elapsedMs" | "step";
  height?: number;
}

const AXIS_STYLE = { fontSize: 11, fill: "var(--viz-ink-muted)" };

function ScoreTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: number;
  unit: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-card px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 text-muted-foreground tabular">
        {unit === "ms" ? `${formatNumber((label ?? 0) / 1000, 2)} s` : `step ${label}`}
      </div>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 tabular">
          <span
            className="inline-block h-2 w-2 rounded-sm"
            style={{ background: entry.color }}
            aria-hidden
          />
          <span className="text-muted-foreground">{entry.name}</span>
          <span className="font-medium">{formatNumber(entry.value ?? 0, 2)}</span>
        </div>
      ))}
    </div>
  );
}

export function ScoreTimeSeries({ history, xKey = "elapsedMs", height = 170 }: Props) {
  // Downsample for smooth rendering; the solver can emit thousands of samples.
  const data = useMemo(() => {
    if (history.length <= 400) return history;
    const stride = Math.ceil(history.length / 400);
    return history.filter((_, index) => index % stride === 0 || index === history.length - 1);
  }, [history]);

  /**
   * Tick formatting has to be range-aware. Rounding elapsed milliseconds to whole
   * seconds produces "1s 1s 1s 2s 2s 2s" across a short solve — repeated labels that
   * read as a rendering bug and make the axis useless. Below ~20s we show a decimal.
   */
  const spanMs = data.length ? data[data.length - 1].elapsedMs - data[0].elapsedMs : 0;
  const secondsDecimals = spanMs < 20_000 ? 1 : 0;
  const formatX = (value: number) =>
    xKey === "elapsedMs" ? `${(value / 1000).toFixed(secondsDecimals)}s` : String(value);

  if (data.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground"
        style={{ height: height * 2 + 16 }}
      >
        Run the solver to plot its trajectory
      </div>
    );
  }

  const panels = [
    {
      title: "Hard score",
      subtitle: "constraint violations — must reach the feasibility bound",
      key: "hard" as const,
      bestKey: "bestHard" as const,
      color: "var(--status-critical)",
    },
    {
      title: "Soft score",
      subtitle: "preference quality — only compared once hard ties",
      key: "soft" as const,
      bestKey: "bestSoft" as const,
      color: "var(--status-warning)",
    },
  ];

  return (
    <div className="space-y-3">
      {panels.map((panel) => (
        <div key={panel.key}>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <div>
              <span className="text-sm font-medium">{panel.title}</span>
              <span className="ml-2 text-xs text-muted-foreground">{panel.subtitle}</span>
            </div>
            {/* Legend is always present for 2 series, and identity is also carried by
                the dash pattern so it is never colour-alone. */}
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <svg width="18" height="6" aria-hidden>
                  <line x1="0" y1="3" x2="18" y2="3" stroke={panel.color} strokeWidth="2" />
                </svg>
                working
              </span>
              <span className="flex items-center gap-1.5">
                <svg width="18" height="6" aria-hidden>
                  <line
                    x1="0"
                    y1="3"
                    x2="18"
                    y2="3"
                    stroke={panel.color}
                    strokeWidth="2"
                    strokeDasharray="3 3"
                  />
                </svg>
                best so far
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={height}>
            <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
              <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
              <XAxis
                dataKey={xKey}
                tick={AXIS_STYLE}
                tickLine={false}
                axisLine={{ stroke: "var(--viz-axis)" }}
                tickFormatter={formatX}
                minTickGap={44}
              />
              <YAxis
                tick={AXIS_STYLE}
                tickLine={false}
                axisLine={false}
                width={52}
                tickFormatter={(value: number) => formatNumber(value)}
              />
              <Tooltip
                content={<ScoreTooltip unit={xKey === "elapsedMs" ? "ms" : "step"} />}
                cursor={{ stroke: "var(--viz-axis)", strokeDasharray: "3 3" }}
              />
              <Line
                type="monotone"
                dataKey={panel.key}
                name="working"
                stroke={panel.color}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey={panel.bestKey}
                name="best so far"
                stroke={panel.color}
                strokeWidth={2}
                strokeDasharray="3 3"
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ))}
    </div>
  );
}
