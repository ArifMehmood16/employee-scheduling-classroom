import { useMemo, useState } from "react";
import { RotateCcw, Shuffle } from "lucide-react";
import { PageHeader } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GanttBoard } from "@/components/GanttBoard";
import { ScoreLevel, StatTile } from "@/components/ScoreDisplay";
import { LoadDistribution } from "@/components/charts/LoadCharts";
import { useScheduleState } from "@/state/ScheduleContext";
import { formatNumber } from "@/lib/utils";
import {
  CONSTRAINTS,
  softScoreCeiling,
  type ConstraintId,
  type ConstraintMatch,
} from "@/timefold/constraints";
import { loadBreakdown } from "@/timefold/loadBalance";
import { deepCloneSchedule } from "@/timefold/domain";
import { EmployeeSchedulingSolver, randomAssignment } from "@/timefold/solver";
import type { DatasetName } from "@/timefold/demoData";

/**
 * A port of the quickstart's PUT /schedules/analyze endpoint, made interactive.
 *
 * Everything on this page is derived from the same ScoreExplanation object that the
 * Java endpoint would return as a ScoreAnalysis: per-constraint totals, and every
 * individual match with its justification.
 */

export default function ConstraintLab() {
  const {
    schedule,
    setSchedule,
    explanation,
    toggles,
    toggleConstraint,
    resetToggles,
    dataset,
    setDataset,
    seed,
    setSeed,
    feasibility,
    clearAssignments,
  } = useScheduleState();

  const [selectedConstraint, setSelectedConstraint] = useState<ConstraintId>(
    "balanceEmployeeShiftAssignments",
  );
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);

  const summaryById = useMemo(
    () => new Map(explanation.summaries.map((s) => [s.constraintId, s])),
    [explanation.summaries],
  );

  const matchesForSelected = useMemo(
    () => explanation.matches.filter((match) => match.constraintId === selectedConstraint),
    [explanation.matches, selectedConstraint],
  );

  const highlighted = useMemo(() => {
    const set = new Set<string>();
    for (const match of matchesForSelected)
      for (const id of match.shiftIds) set.add(id);
    return set;
  }, [matchesForSelected]);

  const loads = useMemo(() => loadBreakdown(explanation.loads), [explanation.loads]);
  const ceiling = useMemo(() => softScoreCeiling(schedule), [schedule]);

  const definition = CONSTRAINTS.find((c) => c.id === selectedConstraint)!;

  const quickSolve = () => {
    const solver = new EmployeeSchedulingSolver(schedule, {
      toggles,
      seed: 7,
      spentLimitMs: 4000,
    });
    solver.runConstructionHeuristic();
    for (let i = 0; i < 40_000; i++) solver.step();
    solver.terminate();
    setSchedule(solver.snapshot());
  };

  const reassign = (shiftId: string, employeeName: string) => {
    const next = deepCloneSchedule(schedule);
    const shift = next.shifts.find((s) => s.id === shiftId);
    if (shift) shift.employee = employeeName;
    setSchedule(next);
  };

  return (
    <>
      <PageHeader
        eyebrow="Constraint Lab"
        title="Score a schedule, then take the rules away one at a time"
        lead="Turning a constraint off does not hide its violations — it stops them being violations. That is the fastest way to feel what each rule is actually holding in place, and which ones the solver is quietly trading against each other."
      >
        <Select value={dataset} onValueChange={(value) => setDataset(value as DatasetName)}>
          <SelectTrigger className="w-[112px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TINY">TINY</SelectItem>
            <SelectItem value="SMALL">SMALL</SelectItem>
            <SelectItem value="LARGE">LARGE</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => setSeed(seed + 1)}>
          <Shuffle /> Seed {seed}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setSchedule(randomAssignment(schedule, seed))}>
          Random fill
        </Button>
        {/* The unassigned state is the "why does this score 0/0?" lesson, so it lives
            behind a deliberate action rather than being where the app starts. */}
        <Button variant="outline" size="sm" onClick={clearAssignments}>
          Clear
        </Button>
        <Button size="sm" onClick={quickSolve}>
          Solve
        </Button>
      </PageHeader>

      <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
        {/* ---------------- Left: constraint toggles ---------------- */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Score</CardTitle>
                <Button variant="ghost" size="sm" onClick={resetToggles}>
                  <RotateCcw /> All on
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <ScoreLevel
                  label="Hard"
                  value={explanation.score.hard}
                  level="hard"
                  size="lg"
                  hint={
                    feasibility.feasible
                      ? "0 is reachable"
                      : `bound is ${feasibility.hardScoreUpperBound}`
                  }
                />
                <ScoreLevel
                  label="Soft"
                  value={explanation.score.soft}
                  level="soft"
                  size="lg"
                  hint={`ceiling ≈ +${formatNumber(ceiling)}`}
                />
              </div>
              {explanation.unassignedCount > 0 ? (
                <div className="text-xs text-muted-foreground">
                  {explanation.unassignedCount} shifts unassigned and therefore uncounted.
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">The eight constraints</CardTitle>
              <CardDescription>
                Click a row to inspect it. Toggle to remove it from the score.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {(["HARD", "SOFT"] as const).map((level) => (
                <div key={level}>
                  <div className="mb-1 mt-2 flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <span
                      className="inline-block h-2 w-2 rounded-sm"
                      style={{
                        background:
                          level === "HARD" ? "var(--status-critical)" : "var(--status-warning)",
                      }}
                    />
                    {level}
                  </div>
                  {CONSTRAINTS.filter((c) => c.level === level).map((constraint) => {
                    const summary = summaryById.get(constraint.id);
                    const active = selectedConstraint === constraint.id;
                    const enabled = toggles[constraint.id];
                    return (
                      <div
                        key={constraint.id}
                        className={`flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors ${
                          active ? "bg-secondary" : "hover:bg-secondary/50"
                        }`}
                      >
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => setSelectedConstraint(constraint.id)}
                        >
                          <div
                            className={`truncate text-xs font-medium ${enabled ? "" : "text-muted-foreground line-through"}`}
                          >
                            {constraint.name}
                          </div>
                          <div className="truncate text-[10px] text-muted-foreground">
                            {enabled && summary
                              ? `${summary.matchCount} match${summary.matchCount === 1 ? "" : "es"} · ${formatNumber(summary.impact, Number.isInteger(summary.impact) ? 0 : 2)}`
                              : "excluded from the score"}
                          </div>
                        </button>
                        {constraint.direction === "REWARD" ? (
                          <Badge variant="ok" className="shrink-0 px-1 text-[9px]">
                            reward
                          </Badge>
                        ) : null}
                        <Switch
                          checked={enabled}
                          onCheckedChange={() => toggleConstraint(constraint.id)}
                          aria-label={`Toggle ${constraint.name}`}
                        />
                      </div>
                    );
                  })}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* ---------------- Right: board + detail ---------------- */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Schedule</CardTitle>
              <CardDescription>
                Shifts violating <span className="text-foreground">{definition.name}</span>{" "}
                are highlighted. Drag any shift onto another employee to reassign it and
                watch the score move.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <GanttBoard
                schedule={schedule}
                explanation={explanation}
                selectedShiftId={selectedShiftId}
                onSelectShift={setSelectedShiftId}
                onReassign={reassign}
                highlightShiftIds={highlighted}
              />
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">{definition.name}</CardTitle>
                  <Badge variant={definition.level === "HARD" ? "hard" : "soft"}>
                    {definition.level}
                  </Badge>
                  <Badge variant="secondary">{definition.direction}</Badge>
                </div>
                <CardDescription>{definition.plainEnglish}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                    Stream
                  </div>
                  <code className="block break-words rounded bg-background/60 p-2 text-[11px] leading-relaxed">
                    {definition.stream}
                  </code>
                </div>
                <div>
                  <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                    Match weight
                  </div>
                  <code className="block break-words rounded bg-background/60 p-2 text-[11px] leading-relaxed">
                    {definition.weightFormula}
                  </code>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {definition.weightRationale}
                  </p>
                </div>
                <Separator />
                <div>
                  <div
                    className="mb-1 text-[11px] uppercase tracking-wide"
                    style={{ color: "var(--status-serious)" }}
                  >
                    If you remove it
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {definition.ifRemoved}
                  </p>
                </div>
                <div className="font-mono text-[10px] text-muted-foreground">
                  {definition.javaMethod}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Matches ({matchesForSelected.length})
                </CardTitle>
                <CardDescription>
                  Each row is one ConstraintMatch, with the arithmetic that produced it.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {matchesForSelected.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    {toggles[selectedConstraint]
                      ? "No matches — this constraint is fully satisfied."
                      : "Constraint is switched off."}
                  </p>
                ) : (
                  <ScrollArea className="h-[290px] pr-3">
                    <div className="space-y-1.5">
                      {matchesForSelected.slice(0, 200).map((match, index) => (
                        <MatchRow
                          key={index}
                          match={match}
                          onSelect={() => setSelectedShiftId(match.shiftIds[0] ?? null)}
                        />
                      ))}
                      {matchesForSelected.length > 200 ? (
                        <p className="pt-2 text-center text-[11px] text-muted-foreground">
                          Showing the first 200 of {matchesForSelected.length}. The real
                          endpoint has the same problem, which is why ScoreAnalysisFetchPolicy
                          exists.
                        </p>
                      ) : null}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Workload distribution</CardTitle>
              <CardDescription>
                unfairness = {formatNumber(loads.unfairness, 4)} · mean{" "}
                {formatNumber(loads.mean, 2)} · σ {formatNumber(loads.stdDev, 3)}
                {!toggles.balanceEmployeeShiftAssignments
                  ? " — balance constraint is OFF, so none of this is being charged"
                  : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <LoadDistribution
                rows={loads.rows}
                mean={loads.mean}
                height={190}
                highlight={
                  selectedShiftId
                    ? (schedule.shifts.find((s) => s.id === selectedShiftId)?.employee ?? null)
                    : null
                }
              />
              <div className="grid gap-2 sm:grid-cols-4">
                <StatTile label="Busiest" value={String(loads.rows[0]?.load ?? 0)} sub={loads.rows[0]?.item} />
                <StatTile
                  label="Idlest"
                  value={String(loads.rows[loads.rows.length - 1]?.load ?? 0)}
                  sub={loads.rows[loads.rows.length - 1]?.item}
                />
                <StatTile label="Σ(xᵢ − x̄)²" value={formatNumber(loads.sumSquaredDeviation, 2)} />
                <StatTile
                  label="Soft charge"
                  value={`−${formatNumber(loads.unfairness, 4)}`}
                  accent="var(--status-warning)"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function MatchRow({ match, onSelect }: { match: ConstraintMatch; onSelect: () => void }) {
  const positive = match.impact > 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full rounded-md border bg-background/40 p-2 text-left transition-colors hover:bg-secondary/60"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 flex-1 text-[11px] leading-snug">{match.explanation}</span>
        <span
          className="shrink-0 font-mono text-[11px] font-semibold tabular"
          style={{
            color: positive
              ? "var(--status-good)"
              : match.level === "HARD"
                ? "var(--status-critical)"
                : "var(--status-warning)",
          }}
        >
          {positive ? "+" : ""}
          {formatNumber(match.impact, Number.isInteger(match.impact) ? 0 : 2)}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px] text-muted-foreground">
        <span>{match.arithmetic}</span>
        {match.shiftIds.length > 0 ? <span>· shift {match.shiftIds.join(", ")}</span> : null}
      </div>
    </button>
  );
}
