import { useMemo } from "react";
import type { LoadBreakdown } from "@/timefold/loadBalance";
import { formatNumber } from "@/lib/utils";

/**
 * Hand-built SVG rather than a chart library, because these two charts need precise
 * control the library does not give: a 2px surface gap between adjacent bars, 4px
 * rounded data-ends anchored to the baseline, and a mean reference line that reads as
 * chrome rather than as a series.
 */

const BAR_GAP = 2;
const CORNER = 4;

/** A bar with only its far end rounded, anchored flush to the baseline. */
function barPath(x: number, y: number, width: number, height: number, up: boolean): string {
  const r = Math.min(CORNER, width / 2, Math.max(0, height));
  if (height <= 0.5) return "";
  if (up) {
    return `M${x},${y + height} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + width - r},${y} Q${x + width},${y} ${x + width},${y + r} L${x + width},${y + height} Z`;
  }
  const bottom = y + height;
  return `M${x},${y} L${x},${bottom - r} Q${x},${bottom} ${x + r},${bottom} L${x + width - r},${bottom} Q${x + width},${bottom} ${x + width},${bottom - r} L${x + width},${y} Z`;
}

/** Horizontal bar: flat at the axis (left), rounded at the data end (right). */
function hBarPath(x: number, y: number, width: number, height: number): string {
  const r = Math.min(CORNER, height / 2, Math.max(0, width));
  if (width <= 0.5) return "";
  const right = x + width;
  return `M${x},${y} L${right - r},${y} Q${right},${y} ${right},${y + r} L${right},${y + height - r} Q${right},${y + height} ${right - r},${y + height} L${x},${y + height} Z`;
}

/**
 * Shifts per employee, with the mean drawn in. One series, so no legend box — the
 * title names it — and values are direct-labelled rather than left to a tooltip.
 */
export function LoadDistribution({
  rows,
  mean,
  height = 190,
  highlight,
}: {
  rows: LoadBreakdown[];
  mean: number;
  height?: number;
  highlight?: string | null;
}) {
  const width = 720;
  const padding = { top: 18, right: 12, bottom: 34, left: 12 };
  const plotHeight = height - padding.top - padding.bottom;
  const plotWidth = width - padding.left - padding.right;
  const maxLoad = Math.max(1, ...rows.map((r) => r.load));
  const slot = plotWidth / Math.max(1, rows.length);
  const barWidth = Math.max(3, slot - BAR_GAP);
  const scale = (value: number) => (value / maxLoad) * plotHeight;
  const meanY = padding.top + plotHeight - scale(mean);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      role="img"
      aria-label={`Shifts assigned per employee. Mean ${formatNumber(mean, 2)}.`}
    >
      {/* Baseline */}
      <line
        x1={padding.left}
        y1={padding.top + plotHeight}
        x2={width - padding.right}
        y2={padding.top + plotHeight}
        stroke="var(--viz-axis)"
      />
      {/* Mean reference — chrome, dashed, labelled. Not a series colour. */}
      <line
        x1={padding.left}
        y1={meanY}
        x2={width - padding.right}
        y2={meanY}
        stroke="var(--viz-ink-muted)"
        strokeWidth={1}
        strokeDasharray="4 4"
      />
      <text
        x={width - padding.right}
        y={meanY - 5}
        textAnchor="end"
        fontSize={10}
        fill="var(--viz-ink-muted)"
      >
        mean x̄ = {formatNumber(mean, 2)}
      </text>

      {rows.map((row, index) => {
        const barHeight = scale(row.load);
        const x = padding.left + index * slot + BAR_GAP / 2;
        const y = padding.top + plotHeight - barHeight;
        const isHighlighted = highlight != null && row.item === highlight;
        return (
          <g key={row.item}>
            <path
              d={barPath(x, y, barWidth, barHeight, true)}
              fill="var(--series-1)"
              opacity={highlight == null || isHighlighted ? 1 : 0.35}
            />
            {isHighlighted ? (
              <path
                d={barPath(x, y, barWidth, barHeight, true)}
                fill="none"
                stroke="var(--viz-surface)"
                strokeWidth={2}
              />
            ) : null}
            {row.load > 0 ? (
              <text
                x={x + barWidth / 2}
                y={y - 4}
                textAnchor="middle"
                fontSize={10}
                className="tabular"
                fill="var(--viz-ink-secondary)"
              >
                {row.load}
              </text>
            ) : null}
            <text
              x={x + barWidth / 2}
              y={padding.top + plotHeight + 12}
              textAnchor="middle"
              fontSize={9}
              fill="var(--viz-ink-muted)"
              transform={`rotate(-38, ${x + barWidth / 2}, ${padding.top + plotHeight + 12})`}
            >
              {row.item.split(" ")[0]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Deviation from the mean — a diverging chart, so it uses the validated blue/red
 * pole pair with a neutral zero line, never a rainbow and never one hue.
 * The bar length is (x_i - x̄); the number printed on it is (x_i - x̄)², the quantity
 * that actually enters the unfairness sum.
 */
export function DeviationChart({
  rows,
  height = 190,
  showSquares = true,
}: {
  rows: LoadBreakdown[];
  height?: number;
  showSquares?: boolean;
}) {
  const width = 720;
  const padding = { top: 16, right: 12, bottom: 30, left: 12 };
  const plotHeight = height - padding.top - padding.bottom;
  const plotWidth = width - padding.left - padding.right;
  const maxAbs = Math.max(0.5, ...rows.map((r) => Math.abs(r.deviation)));
  const zeroY = padding.top + plotHeight / 2;
  const slot = plotWidth / Math.max(1, rows.length);
  const barWidth = Math.max(3, slot - BAR_GAP);
  const scale = (value: number) => (Math.abs(value) / maxAbs) * (plotHeight / 2 - 10);

  const sorted = useMemo(() => [...rows].sort((a, b) => b.deviation - a.deviation), [rows]);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      role="img"
      aria-label="Deviation of each employee's shift count from the mean."
    >
      <line
        x1={padding.left}
        y1={zeroY}
        x2={width - padding.right}
        y2={zeroY}
        stroke="var(--viz-axis)"
      />
      {sorted.map((row, index) => {
        const barHeight = scale(row.deviation);
        const up = row.deviation >= 0;
        const x = padding.left + index * slot + BAR_GAP / 2;
        const y = up ? zeroY - barHeight : zeroY;
        return (
          <g key={row.item}>
            <path
              d={barPath(x, y, barWidth, barHeight, up)}
              fill={up ? "var(--diverge-pos)" : "var(--diverge-neg)"}
            />
            {showSquares && Math.abs(row.deviation) > 0.01 ? (
              <text
                x={x + barWidth / 2}
                y={up ? y - 4 : y + barHeight + 11}
                textAnchor="middle"
                fontSize={9}
                className="tabular"
                fill="var(--viz-ink-secondary)"
              >
                {formatNumber(row.squaredDeviation, 2)}
              </text>
            ) : null}
          </g>
        );
      })}
      <text x={padding.left} y={padding.top + 4} fontSize={10} fill="var(--viz-ink-muted)">
        above mean ▲
      </text>
      <text
        x={padding.left}
        y={padding.top + plotHeight + 8}
        fontSize={10}
        fill="var(--viz-ink-muted)"
      >
        below mean ▼
      </text>
    </svg>
  );
}

/**
 * Orders of magnitude on a log10 axis, one series. Log scale is stated in the axis
 * label because a log axis that does not announce itself is a lie.
 */
export function MagnitudeBars({
  items,
  height = 210,
}: {
  items: Array<{ label: string; log10: number; note?: string; emphasis?: boolean }>;
  height?: number;
}) {
  const width = 720;
  const padding = { top: 8, right: 150, bottom: 26, left: 210 };
  const plotWidth = width - padding.left - padding.right;
  const rowHeight = (height - padding.top - padding.bottom) / Math.max(1, items.length);
  const maxLog = Math.max(...items.map((i) => i.log10), 10);
  const scale = (log10: number) => Math.max(0, (log10 / maxLog) * plotWidth);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      role="img"
      aria-label="Comparison of magnitudes on a base-10 logarithmic scale."
    >
      {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
        const x = padding.left + fraction * plotWidth;
        return (
          <g key={fraction}>
            <line
              x1={x}
              y1={padding.top}
              x2={x}
              y2={height - padding.bottom}
              stroke="var(--viz-grid)"
            />
            <text
              x={x}
              y={height - padding.bottom + 13}
              textAnchor="middle"
              fontSize={9}
              fill="var(--viz-ink-muted)"
            >
              10^{Math.round(fraction * maxLog)}
            </text>
          </g>
        );
      })}
      <text
        x={padding.left + plotWidth / 2}
        y={height - 2}
        textAnchor="middle"
        fontSize={9}
        fill="var(--viz-ink-muted)"
      >
        number of possibilities (base-10 log scale)
      </text>

      {items.map((item, index) => {
        const barHeight = Math.max(6, rowHeight - 8);
        const y = padding.top + index * rowHeight + (rowHeight - barHeight) / 2;
        const barWidth = scale(item.log10);
        return (
          <g key={item.label}>
            <text
              x={padding.left - 10}
              y={y + barHeight / 2 + 3}
              textAnchor="end"
              fontSize={10}
              fill={item.emphasis ? "var(--foreground)" : "var(--viz-ink-secondary)"}
              fontWeight={item.emphasis ? 600 : 400}
            >
              {item.label}
            </text>
            <path
              d={hBarPath(padding.left, y, barWidth, barHeight)}
              fill={item.emphasis ? "var(--series-2)" : "var(--series-1)"}
              opacity={item.emphasis ? 1 : 0.55}
            />
            <text
              x={padding.left + barWidth + 8}
              y={y + barHeight / 2 + 3}
              fontSize={10}
              className="tabular"
              fill="var(--viz-ink-muted)"
            >
              {item.note ?? `10^${item.log10.toFixed(1)}`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
