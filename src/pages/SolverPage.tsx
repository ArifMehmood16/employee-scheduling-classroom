import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Gauge, Pause, Play, RotateCcw, Swords, X } from "lucide-react";
import { PageHeader } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GanttBoard } from "@/components/GanttBoard";
import { FeasibilityBadge, ScoreLevel, StatTile } from "@/components/ScoreDisplay";
import { ScoreTimeSeries } from "@/components/charts/ScoreTimeSeries";
import { useScheduleState } from "@/state/ScheduleContext";
import { formatNumber } from "@/lib/utils";
import { evaluateSchedule } from "@/timefold/constraints";
import type { EmployeeSchedule } from "@/timefold/domain";
import {
  DEFAULT_CONFIG,
  EmployeeSchedulingSolver,
  describeMove,
  type AcceptorType,
  type ConstructionHeuristicType,
  type EvaluatedMove,
  type ScoreSample,
  type SolverStats,
} from "@/timefold/solver";

const ACCEPTORS: Array<{ value: AcceptorType; label: string; note: string }> = [
  {
    value: "LATE_ACCEPTANCE",
    label: "Late Acceptance",
    note: "Timefold's default. Accept if ≥ the score from L steps ago, or ≥ the last step.",
  },
  {
    value: "HILL_CLIMBING",
    label: "Hill Climbing",
    note: "Accept only non-worsening moves. Halts at the first local optimum.",
  },
  {
    value: "SIMULATED_ANNEALING",
    label: "Simulated Annealing",
    note: "Accept a worsening of Δ with probability exp(−Δ/T), T decaying over the budget.",
  },
  {
    value: "TABU_SEARCH",
    label: "Tabu Search",
    note: "Forbid recently-touched entities, with an aspiration override for new bests.",
  },
];

export default function SolverPage() {
  const { schedule, setSchedule, toggles, feasibility, dataset } = useScheduleState();

  const [acceptor, setAcceptor] = useState<AcceptorType>("LATE_ACCEPTANCE");
  const [lateAcceptanceSize, setLateAcceptanceSize] = useState(400);
  const [hillClimbingEnabled, setHillClimbingEnabled] = useState(true);
  const [temperature, setTemperature] = useState(200);
  const [tabuSize, setTabuSize] = useState(7);
  const [changeMoveRatio, setChangeMoveRatio] = useState(0.6);
  const [constructionHeuristic, setConstructionHeuristic] =
    useState<ConstructionHeuristicType>("FIRST_FIT");
  const [spentLimitSeconds, setSpentLimitSeconds] = useState(30);
  const [seed, setSolverSeed] = useState(0);

  const solverRef = useRef<EmployeeSchedulingSolver | null>(null);
  const frameRef = useRef<number | null>(null);
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState<SolverStats | null>(null);
  const [history, setHistory] = useState<ScoreSample[]>([]);
  const [recentMoves, setRecentMoves] = useState<EvaluatedMove[]>([]);
  const [live, setLive] = useState<EmployeeSchedule | null>(null);

  const config = useMemo(
    () => ({
      ...DEFAULT_CONFIG,
      acceptor,
      lateAcceptanceSize,
      hillClimbingEnabled,
      startingTemperature: temperature,
      tabuSize,
      changeMoveRatio,
      constructionHeuristic,
      spentLimitMs: spentLimitSeconds * 1000,
      seed,
      toggles,
    }),
    [
      acceptor,
      lateAcceptanceSize,
      hillClimbingEnabled,
      temperature,
      tabuSize,
      changeMoveRatio,
      constructionHeuristic,
      spentLimitSeconds,
      seed,
      toggles,
    ],
  );

  const stop = useCallback(() => {
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    setRunning(false);
  }, []);

  useEffect(() => () => stop(), [stop]);

  /**
   * The solver runs on the main thread, time-sliced from an animation frame. A Web
   * Worker would keep the UI perfectly smooth, but it would also hide the moves — and
   * being able to watch individual accept/reject decisions is the point of this page.
   * 12ms per frame leaves the rest of the budget for React.
   */
  const lastPublishRef = useRef(0);

  const tick = useCallback(() => {
    const solver = solverRef.current;
    if (!solver) return;
    solver.runSlice(12);
    setStats({ ...solver.stats });
    setHistory([...solver.history]);
    setRecentMoves([...solver.recentMoves]);
    setLive(solver.snapshot());

    if (solver.stats.phase === "TERMINATED") {
      setSchedule(solver.snapshot());
      stop();
      return;
    }

    // Publish to the shared schedule ~2x a second so the header score and the other
    // pages track the solve. Not every frame: the shared context recomputes the full
    // score explanation (with every constraint match) on change, which is far too much
    // work to do 60 times a second.
    const now = performance.now();
    if (now - lastPublishRef.current > 500) {
      lastPublishRef.current = now;
      setSchedule(solver.snapshot());
    }

    frameRef.current = requestAnimationFrame(tick);
  }, [setSchedule, stop]);

  const start = () => {
    const solver = new EmployeeSchedulingSolver(schedule, config);
    solverRef.current = solver;
    solver.start();
    setStats({ ...solver.stats });
    setHistory([...solver.history]);
    setRunning(true);
    frameRef.current = requestAnimationFrame(tick);
  };

  const pause = () => {
    solverRef.current?.pause();
    stop();
    if (solverRef.current) setSchedule(solverRef.current.snapshot());
  };

  const resume = () => {
    solverRef.current?.start();
    setRunning(true);
    frameRef.current = requestAnimationFrame(tick);
  };

  const reset = () => {
    stop();
    solverRef.current = null;
    setStats(null);
    setHistory([]);
    setRecentMoves([]);
    setLive(null);
  };

  const stepOnce = () => {
    let solver = solverRef.current;
    if (!solver) {
      solver = new EmployeeSchedulingSolver(schedule, config);
      solverRef.current = solver;
      solver.start();
    }
    solver.step();
    setStats({ ...solver.stats });
    setHistory([...solver.history]);
    setRecentMoves([...solver.recentMoves]);
    setLive(solver.snapshot());
  };

  const displayed = live ?? schedule;
  const explanation = useMemo(
    () => evaluateSchedule(displayed, toggles, true),
    [displayed, toggles],
  );
  const progress = stats
    ? Math.min(100, (stats.elapsedMs / (spentLimitSeconds * 1000)) * 100)
    : 0;

  return (
    <>
      <PageHeader
        eyebrow="Solver"
        title="Watch it search"
        lead="A real construction heuristic followed by real local search, running in this tab. Every accept and reject decision below is the actual acceptance criterion being applied to an actual scored move — nothing here is scripted."
      >
        {stats ? (
          <FeasibilityBadge
            hard={stats.bestScore.hard}
            bound={feasibility.hardScoreUpperBound}
          />
        ) : null}
      </PageHeader>

      <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
        {/* ---------------- Controls ---------------- */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Run</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                {!running ? (
                  <Button className="flex-1" onClick={stats ? resume : start}>
                    <Play /> {stats ? "Resume" : "Solve"}
                  </Button>
                ) : (
                  <Button className="flex-1" variant="secondary" onClick={pause}>
                    <Pause /> Pause
                  </Button>
                )}
                <Button variant="outline" onClick={stepOnce} disabled={running}>
                  Step
                </Button>
                <Button variant="ghost" size="icon" onClick={reset} aria-label="Reset">
                  <RotateCcw />
                </Button>
              </div>

              {stats ? (
                <>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full transition-[width]"
                      style={{ width: `${progress}%`, background: "var(--series-1)" }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <ScoreLevel
                      label="Best hard"
                      value={stats.bestScore.hard}
                      level="hard"
                      hint={`bound ${feasibility.hardScoreUpperBound}`}
                    />
                    <ScoreLevel label="Best soft" value={stats.bestScore.soft} level="soft" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <StatTile label="Phase" value={stats.phase.replace("_", " ")} />
                    <StatTile label="Steps" value={formatNumber(stats.step)} />
                    <StatTile
                      label="Moves evaluated"
                      value={formatNumber(stats.movesEvaluated)}
                    />
                    <StatTile
                      label="Moves / second"
                      value={formatNumber(stats.movesPerSecond)}
                      accent="var(--series-1)"
                    />
                    <StatTile
                      label="Acceptance rate"
                      value={`${formatNumber(stats.acceptanceRate * 100, 1)}%`}
                      sub="low is healthy late in a solve"
                    />
                    <StatTile
                      label="Unimproved steps"
                      value={formatNumber(stats.unimprovedSteps)}
                    />
                  </div>
                </>
              ) : (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {dataset} · {schedule.shifts.length} shifts, {schedule.employees.length}{" "}
                  employees.{" "}
                  {feasibility.feasible
                    ? "This instance is feasible, so 0hard is reachable."
                    : `This instance is over-constrained: the provable best hard score is ${feasibility.hardScoreUpperBound}.`}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Configuration</CardTitle>
              <CardDescription>
                The quickstart sets none of this — every value here is a Timefold default
                except where noted.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium">Construction heuristic</label>
                <Select
                  value={constructionHeuristic}
                  onValueChange={(value) =>
                    setConstructionHeuristic(value as ConstructionHeuristicType)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIRST_FIT">First Fit</SelectItem>
                    <SelectItem value="BEST_FIT">Best Fit</SelectItem>
                    <SelectItem value="NONE">None (start unassigned)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                  Curiosity worth chasing: in this model First Fit behaves identically to
                  Best Fit, because the balance constraint changes on{" "}
                  <em>every</em> assignment, so &ldquo;first non-deteriorating value&rdquo;
                  never fires.
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium">Acceptor</label>
                <Select value={acceptor} onValueChange={(value) => setAcceptor(value as AcceptorType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCEPTORS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                  {ACCEPTORS.find((a) => a.value === acceptor)?.note}
                </p>
              </div>

              {acceptor === "LATE_ACCEPTANCE" ? (
                <>
                  <LabelledSlider
                    label="lateAcceptanceSize (L)"
                    value={lateAcceptanceSize}
                    min={1}
                    max={2000}
                    step={1}
                    onChange={setLateAcceptanceSize}
                    hint="Timefold default 400. At L=1 this becomes hill climbing; very large L accepts almost anything."
                  />
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-medium">hillClimbingEnabled</div>
                      <div className="text-[11px] text-muted-foreground">
                        Also accept if ≥ the last step. Default on.
                      </div>
                    </div>
                    <Switch
                      checked={hillClimbingEnabled}
                      onCheckedChange={setHillClimbingEnabled}
                    />
                  </div>
                </>
              ) : null}

              {acceptor === "SIMULATED_ANNEALING" ? (
                <LabelledSlider
                  label="Starting temperature"
                  value={temperature}
                  min={1}
                  max={2000}
                  step={1}
                  onChange={setTemperature}
                  hint="In soft-score units — which is exactly the tuning burden late acceptance avoids."
                />
              ) : null}

              {acceptor === "TABU_SEARCH" ? (
                <LabelledSlider
                  label="Tabu size"
                  value={tabuSize}
                  min={1}
                  max={50}
                  step={1}
                  onChange={setTabuSize}
                  hint="How many recently-touched shifts are forbidden."
                />
              ) : null}

              <Separator />

              <LabelledSlider
                label="Change-move share"
                value={Math.round(changeMoveRatio * 100)}
                min={0}
                max={100}
                step={5}
                suffix="%"
                onChange={(value) => setChangeMoveRatio(value / 100)}
                hint="The rest are swap moves. Pure change moves cannot easily exchange two employees' whole days."
              />
              <LabelledSlider
                label="Time limit"
                value={spentLimitSeconds}
                min={2}
                max={120}
                step={1}
                suffix="s"
                onChange={setSpentLimitSeconds}
                hint="application.properties sets spent-limit=30s."
              />
              <LabelledSlider
                label="Random seed"
                value={seed}
                min={0}
                max={50}
                step={1}
                onChange={setSolverSeed}
                hint="Same seed, same trajectory — essential for comparing configurations honestly."
              />
            </CardContent>
          </Card>
        </div>

        {/* ---------------- Main ---------------- */}
        <div className="space-y-4">
          <Tabs defaultValue="board">
            <TabsList>
              <TabsTrigger value="board">Board</TabsTrigger>
              <TabsTrigger value="trajectory">Trajectory</TabsTrigger>
              <TabsTrigger value="moves">Move inspector</TabsTrigger>
              <TabsTrigger value="race">Acceptor race</TabsTrigger>
            </TabsList>

            <TabsContent value="board">
              <Card>
                <CardContent className="pt-5">
                  <GanttBoard schedule={displayed} explanation={explanation} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="trajectory">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Score over time</CardTitle>
                  <CardDescription>
                    Two charts rather than one with two y-axes: hard lives in the tens and
                    soft in the thousands, and they are separate levels of a lexicographic
                    order — not two parts of one quantity. A shared or dual axis would
                    invent a relationship that does not exist.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScoreTimeSeries history={history} />
                  {history.length > 2 ? (
                    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                      Notice the shape: hard score collapses toward the bound almost
                      immediately, then flatlines while soft score keeps grinding upward for
                      the rest of the budget. That is lexicographic ordering made visible —
                      once hard stops improving, every remaining move is competing purely on
                      soft.
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="moves">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Last {recentMoves.length} moves</CardTitle>
                  <CardDescription>
                    Use <span className="kbd">Step</span> to advance one accepted move at a
                    time. The reason column is the acceptance clause that actually fired.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {recentMoves.length === 0 ? (
                    <p className="py-8 text-center text-xs text-muted-foreground">
                      Start the solver, or press Step.
                    </p>
                  ) : (
                    <ScrollArea className="h-[440px] pr-3">
                      <div className="space-y-1">
                        {recentMoves.map((move, index) => (
                          <MoveRow key={index} move={move} />
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="race">
              <AcceptorRace />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
}

function LabelledSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  hint,
  suffix = "",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  hint?: string;
  suffix?: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <label className="text-xs font-medium">{label}</label>
        <span className="font-mono text-xs tabular text-muted-foreground">
          {value}
          {suffix}
        </span>
      </div>
      <Slider min={min} max={max} step={step} value={[value]} onValueChange={([next]) => onChange(next)} />
      {hint ? <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function MoveRow({ move }: { move: EvaluatedMove }) {
  const improved = move.deltaHard > 0 || (move.deltaHard === 0 && move.deltaSoft > 0);
  return (
    <div
      className="rounded-md border p-2"
      style={{
        borderColor: move.accepted ? "color-mix(in srgb, var(--status-good) 40%, transparent)" : undefined,
        background: move.accepted
          ? "color-mix(in srgb, var(--status-good) 7%, transparent)"
          : undefined,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-1.5">
          {move.accepted ? (
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "var(--status-good)" }} />
          ) : (
            <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0">
            <div className="truncate font-mono text-[11px]">{describeMove(move.move)}</div>
            <div className="text-[10px] text-muted-foreground">{move.reason}</div>
          </div>
        </div>
        <div className="shrink-0 text-right font-mono text-[11px] tabular">
          <div style={{ color: move.deltaHard === 0 ? "var(--viz-ink-muted)" : "var(--status-critical)" }}>
            {move.deltaHard > 0 ? "+" : ""}
            {move.deltaHard} hard
          </div>
          <div style={{ color: move.deltaSoft === 0 ? "var(--viz-ink-muted)" : "var(--status-warning)" }}>
            {move.deltaSoft > 0 ? "+" : ""}
            {formatNumber(move.deltaSoft, 2)} soft
          </div>
        </div>
      </div>
      {improved ? (
        <Badge variant="ok" className="mt-1.5 px-1 text-[9px]">
          improvement
        </Badge>
      ) : null}
    </div>
  );
}

/**
 * Race all four acceptors on the same instance, same seed, same move budget. This is the
 * only honest way to compare metaheuristics: change one thing.
 */
function AcceptorRace() {
  const { schedule, toggles } = useScheduleState();
  const [results, setResults] = useState<
    Array<{ acceptor: AcceptorType; label: string; hard: number; soft: number; steps: number }>
  >([]);
  const [busy, setBusy] = useState(false);

  const run = () => {
    setBusy(true);
    setTimeout(() => {
      const output = ACCEPTORS.map((option) => {
        const solver = new EmployeeSchedulingSolver(schedule, {
          ...DEFAULT_CONFIG,
          acceptor: option.value,
          toggles,
          seed: 3,
          spentLimitMs: Number.MAX_SAFE_INTEGER,
        });
        solver.runConstructionHeuristic();
        for (let i = 0; i < 30_000; i++) solver.step();
        solver.terminate();
        return {
          acceptor: option.value,
          label: option.label,
          hard: solver.bestScore().hard,
          soft: solver.bestScore().soft,
          steps: solver.stats.step,
        };
      });
      setResults(output);
      setBusy(false);
    }, 30);
  };

  const best = results.length
    ? results.reduce((a, b) => (b.hard > a.hard || (b.hard === a.hard && b.soft > a.soft) ? b : a))
    : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Acceptor race</CardTitle>
        <CardDescription>
          Same instance, same seed, 30,000 steps each. Only the acceptance rule differs.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={run} disabled={busy} className="w-full">
          {busy ? <Gauge className="animate-pulse" /> : <Swords />}
          {busy ? "Racing… (this blocks the tab for a few seconds)" : "Run the race"}
        </Button>

        {results.length > 0 ? (
          <div className="space-y-2">
            {results.map((result) => (
              <div
                key={result.acceptor}
                className="flex items-center justify-between gap-3 rounded-md border p-3"
                style={
                  result === best
                    ? {
                        borderColor: "color-mix(in srgb, var(--status-good) 45%, transparent)",
                        background: "color-mix(in srgb, var(--status-good) 7%, transparent)",
                      }
                    : undefined
                }
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {result.label}
                    {result === best ? (
                      <Badge variant="ok" className="px-1 text-[9px]">
                        best
                      </Badge>
                    ) : null}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {formatNumber(result.steps)} accepted steps
                  </div>
                </div>
                <div className="shrink-0 text-right font-mono text-xs tabular">
                  <div style={{ color: "var(--status-critical)" }}>{result.hard} hard</div>
                  <div style={{ color: "var(--status-warning)" }}>
                    {formatNumber(result.soft, 1)} soft
                  </div>
                </div>
              </div>
            ))}
            <p className="text-xs leading-relaxed text-muted-foreground">
              Hill climbing usually reaches a decent hard score fast and then stops dead —
              it has no mechanism for leaving a local optimum. Late acceptance and tabu
              search keep finding soft-score improvements long after hill climbing has
              given up. Simulated annealing&rsquo;s result depends heavily on whether the
              starting temperature happens to suit this instance, which is precisely the
              tuning burden that makes it a poor default.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
