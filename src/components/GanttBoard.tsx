import { useMemo } from "react";
import { AlertTriangle, Heart, ThumbsDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  dateOf,
  scheduleDates,
  timeLabel,
  type EmployeeSchedule,
  type Shift,
} from "@/timefold/domain";
import type { ScoreExplanation } from "@/timefold/constraints";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * The schedule as a grid: employees down, days across.
 *
 * This is not a chart, so the data-viz palette rules about series colours do not apply —
 * but the availability markers ARE status semantics, so they use the reserved status
 * colours and each carries an icon, never colour alone.
 */

interface Props {
  schedule: EmployeeSchedule;
  explanation: ScoreExplanation;
  selectedShiftId?: string | null;
  onSelectShift?: (shiftId: string | null) => void;
  /** Reassign a shift by dropping it on another employee's row. */
  onReassign?: (shiftId: string, employeeName: string) => void;
  highlightShiftIds?: Set<string>;
}

type DayMarker = "unavailable" | "undesired" | "desired" | null;

export function GanttBoard({
  schedule,
  explanation,
  selectedShiftId,
  onSelectShift,
  onReassign,
  highlightShiftIds,
}: Props) {
  const dates = useMemo(() => scheduleDates(schedule), [schedule]);

  const byEmployeeAndDate = useMemo(() => {
    const map = new Map<string, Map<string, Shift[]>>();
    for (const employee of schedule.employees) map.set(employee.name, new Map());
    for (const shift of schedule.shifts) {
      if (shift.employee == null) continue;
      const perDate = map.get(shift.employee);
      if (!perDate) continue;
      const date = dateOf(shift.start);
      const list = perDate.get(date);
      if (list) list.push(shift);
      else perDate.set(date, [shift]);
    }
    return map;
  }, [schedule]);

  const unassigned = useMemo(
    () => schedule.shifts.filter((shift) => shift.employee == null),
    [schedule],
  );

  const markerFor = (employeeName: string, date: string): DayMarker => {
    const employee = schedule.employees.find((e) => e.name === employeeName);
    if (!employee) return null;
    if (employee.unavailableDates.includes(date)) return "unavailable";
    if (employee.undesiredDates.includes(date)) return "undesired";
    if (employee.desiredDates.includes(date)) return "desired";
    return null;
  };

  return (
    <div className="space-y-3">
      {unassigned.length > 0 ? (
        <div
          className="flex flex-wrap items-center gap-2 rounded-md p-2.5 text-xs"
          style={{ background: "color-mix(in srgb, var(--status-serious) 14%, transparent)" }}
        >
          <AlertTriangle className="h-4 w-4" style={{ color: "var(--status-serious)" }} />
          <span className="font-medium">{unassigned.length} unassigned</span>
          <span className="text-muted-foreground">
            — invisible to every constraint using forEach, which is why they cost nothing.
          </span>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 border-b border-r bg-card px-2 py-2 text-left font-medium">
                Employee
              </th>
              {dates.map((date) => (
                <th
                  key={date}
                  className="border-b border-r px-1 py-2 text-center font-medium text-muted-foreground last:border-r-0"
                  style={{ minWidth: 62 }}
                >
                  <div className="tabular">{date.slice(8)}</div>
                  <div className="text-[10px] font-normal opacity-70">
                    {new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
                      weekday: "short",
                      timeZone: "UTC",
                    })}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {schedule.employees.map((employee) => {
              const perDate = byEmployeeAndDate.get(employee.name);
              const total = [...(perDate?.values() ?? [])].reduce(
                (sum, list) => sum + list.length,
                0,
              );
              return (
                <tr key={employee.name} className="group">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-b border-r bg-card px-2 py-1 text-left font-normal"
                    style={{ minWidth: 156 }}
                    onDragOver={(event) => {
                      if (onReassign) event.preventDefault();
                    }}
                    onDrop={(event) => {
                      const shiftId = event.dataTransfer.getData("text/shift-id");
                      if (shiftId && onReassign) onReassign(shiftId, employee.name);
                    }}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-medium">{employee.name}</span>
                      <span className="shrink-0 tabular text-[10px] text-muted-foreground">
                        {total}
                      </span>
                    </div>
                    <div className="truncate text-[10px] text-muted-foreground">
                      {employee.skills.join(" · ")}
                    </div>
                  </th>

                  {dates.map((date) => {
                    const shifts = perDate?.get(date) ?? [];
                    const marker = markerFor(employee.name, date);
                    return (
                      <td
                        key={date}
                        className={cn(
                          "border-b border-r p-0.5 align-top last:border-r-0",
                          marker === "unavailable" && "bg-[color-mix(in_srgb,var(--status-critical)_11%,transparent)]",
                          marker === "undesired" && "bg-[color-mix(in_srgb,var(--status-warning)_10%,transparent)]",
                          marker === "desired" && "bg-[color-mix(in_srgb,var(--status-good)_10%,transparent)]",
                        )}
                        onDragOver={(event) => {
                          if (onReassign) event.preventDefault();
                        }}
                        onDrop={(event) => {
                          const shiftId = event.dataTransfer.getData("text/shift-id");
                          if (shiftId && onReassign) onReassign(shiftId, employee.name);
                        }}
                      >
                        {marker && shifts.length === 0 ? (
                          <div className="flex h-6 items-center justify-center opacity-45">
                            <MarkerIcon marker={marker} />
                          </div>
                        ) : null}
                        <div className="space-y-0.5">
                          {shifts.map((shift) => (
                            <ShiftChip
                              key={shift.id}
                              shift={shift}
                              hardCount={explanation.hardViolationsByShift.get(shift.id) ?? 0}
                              softCount={explanation.softViolationsByShift.get(shift.id) ?? 0}
                              selected={selectedShiftId === shift.id}
                              highlighted={highlightShiftIds?.has(shift.id) ?? false}
                              onSelect={onSelectShift}
                              draggable={Boolean(onReassign)}
                            />
                          ))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-muted-foreground">
        <LegendItem marker="unavailable" label="Unavailable (hard)" />
        <LegendItem marker="undesired" label="Undesired (soft penalty)" />
        <LegendItem marker="desired" label="Desired (soft reward)" />
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-sm border"
            style={{ borderColor: "var(--status-critical)", borderWidth: 2 }}
          />
          hard violation
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-sm border border-dashed"
            style={{ borderColor: "var(--status-warning)", borderWidth: 2 }}
          />
          soft penalty
        </span>
        {onReassign ? <span className="italic">drag a shift onto another row to reassign</span> : null}
      </div>
    </div>
  );
}

function MarkerIcon({ marker }: { marker: Exclude<DayMarker, null> }) {
  if (marker === "unavailable")
    return <X className="h-3 w-3" style={{ color: "var(--status-critical)" }} aria-label="unavailable" />;
  if (marker === "undesired")
    return (
      <ThumbsDown className="h-3 w-3" style={{ color: "var(--status-warning)" }} aria-label="undesired" />
    );
  return <Heart className="h-3 w-3" style={{ color: "var(--status-good)" }} aria-label="desired" />;
}

function LegendItem({ marker, label }: { marker: Exclude<DayMarker, null>; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <MarkerIcon marker={marker} />
      {label}
    </span>
  );
}

function ShiftChip({
  shift,
  hardCount,
  softCount,
  selected,
  highlighted,
  onSelect,
  draggable,
}: {
  shift: Shift;
  hardCount: number;
  softCount: number;
  selected: boolean;
  highlighted: boolean;
  onSelect?: (id: string | null) => void;
  draggable: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          draggable={draggable}
          onDragStart={(event) => event.dataTransfer.setData("text/shift-id", shift.id)}
          onClick={() => onSelect?.(selected ? null : shift.id)}
          className={cn(
            "w-full truncate rounded px-1 py-0.5 text-left text-[10px] leading-tight transition-all",
            "bg-secondary hover:bg-accent",
            hardCount > 0 && "ring-2",
            hardCount === 0 && softCount > 0 && "ring-1 ring-dashed",
            selected && "outline outline-2 outline-offset-1 outline-primary",
            highlighted && "bg-primary/25",
          )}
          style={{
            ...(hardCount > 0 ? { boxShadow: `inset 0 0 0 2px var(--status-critical)` } : {}),
            ...(hardCount === 0 && softCount > 0
              ? { boxShadow: `inset 0 0 0 1px var(--status-warning)` }
              : {}),
          }}
        >
          <span className="tabular">{timeLabel(shift.start)}</span>{" "}
          <span className="opacity-70">{shift.requiredSkill.slice(0, 4)}</span>
          {hardCount > 0 ? (
            <span className="ml-0.5 font-semibold" style={{ color: "var(--status-critical)" }}>
              ✕{hardCount}
            </span>
          ) : null}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <div className="space-y-0.5">
          <div className="font-medium">
            {shift.location} · {timeLabel(shift.start)}–{timeLabel(shift.end)}
          </div>
          <div className="text-muted-foreground">Requires {shift.requiredSkill}</div>
          <div className="font-mono text-[10px] text-muted-foreground">
            shift id {shift.id}
          </div>
          {hardCount > 0 ? (
            <div style={{ color: "var(--status-critical)" }}>
              {hardCount} hard violation{hardCount === 1 ? "" : "s"}
            </div>
          ) : null}
          {softCount > 0 ? (
            <div style={{ color: "var(--status-warning)" }}>
              {softCount} soft penalt{softCount === 1 ? "y" : "ies"}
            </div>
          ) : null}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
