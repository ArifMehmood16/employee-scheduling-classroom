import { useMemo, useState } from "react";
import { ArrowRight, Calculator, Loader2, Play } from "lucide-react";
import { PageHeader } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Display, Frac, Math as M, Step, Sub, Sum, Sup, Sqrt } from "@/components/Formula";
import { DeviationChart, LoadDistribution, MagnitudeBars } from "@/components/charts/LoadCharts";
import { StatTile } from "@/components/ScoreDisplay";
import { useScheduleState } from "@/state/ScheduleContext";
import { formatNumber } from "@/lib/utils";
import {
  formatLog10,
  formatLog10Seconds,
  log10Combinations,
  log10Permutations,
  MAGNITUDE_ANCHORS,
} from "@/timefold/searchSpace";
import {
  loadBreakdown,
  loadStandardDeviation,
  unfairnessDirect,
} from "@/timefold/loadBalance";
import { compareScore } from "@/timefold/score";
import { benchmarkScoreModes } from "@/timefold/solver";

export default function MathLab() {
  return (
    <>
      <PageHeader
        eyebrow="Maths & statistics"
        title="The numbers behind the solver"
        lead="Every formula on this page was taken from the Timefold solver source or derived from the constraint definitions — not paraphrased from the documentation. Where the docs are silent (the unfairness metric is the notable case), the derivation is shown in full so you can check it."
      />
      <Tabs defaultValue="space">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="space">1 · Search space</TabsTrigger>
          <TabsTrigger value="order">2 · Score order</TabsTrigger>
          <TabsTrigger value="gradient">3 · Weighers &amp; gradients</TabsTrigger>
          <TabsTrigger value="balance">4 · Load balancing</TabsTrigger>
          <TabsTrigger value="bound">5 · Feasibility bound</TabsTrigger>
          <TabsTrigger value="speed">6 · Incremental scoring</TabsTrigger>
        </TabsList>

        <TabsContent value="space">
          <SearchSpaceSection />
        </TabsContent>
        <TabsContent value="order">
          <ScoreOrderSection />
        </TabsContent>
        <TabsContent value="gradient">
          <GradientSection />
        </TabsContent>
        <TabsContent value="balance">
          <LoadBalanceSection />
        </TabsContent>
        <TabsContent value="bound">
          <FeasibilityBoundSection />
        </TabsContent>
        <TabsContent value="speed">
          <IncrementalSection />
        </TabsContent>
      </Tabs>
    </>
  );
}

// ===========================================================================
// 1 · Search space
// ===========================================================================

function SearchSpaceSection() {
  const { searchSpace, schedule, dataset } = useScheduleState();
  const { employeeCount, shiftCount } = searchSpace;

  const anchors = useMemo(() => {
    const items = [
      ...MAGNITUDE_ANCHORS.map((anchor) => ({
        label: anchor.label,
        log10: anchor.log10,
        note: anchor.note,
      })),
      {
        label: `This problem (${dataset}): |E|^|S|`,
        log10: searchSpace.rawLog10,
        note: formatLog10(searchSpace.rawLog10),
        emphasis: true,
      },
      {
        label: "…respecting one shift per day",
        log10: Number.isFinite(searchSpace.oneShiftPerDayLog10)
          ? searchSpace.oneShiftPerDayLog10
          : 0,
        note: formatLog10(searchSpace.oneShiftPerDayLog10),
        emphasis: true,
      },
      {
        label: "Neighbourhood searched per step",
        log10: Math.log10(Math.max(1, searchSpace.neighbourhoodSize)),
        note: formatNumber(searchSpace.neighbourhoodSize),
        emphasis: true,
      },
    ];
    return items.sort((a, b) => a.log10 - b.log10);
  }, [dataset, searchSpace]);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>How many possible schedules are there?</CardTitle>
          <CardDescription>
            One planning variable per shift, each drawn independently from the employee
            list. That gives a count, and the count settles the question of whether you
            can enumerate.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Display label="raw search space">
            |searchSpace| = |E|<Sup>|S|</Sup> = {employeeCount}
            <Sup>{shiftCount}</Sup> ≈ {formatLog10(searchSpace.rawLog10)}
          </Display>

          <div className="grid gap-2 sm:grid-cols-3">
            <StatTile label="Employees |E|" value={String(employeeCount)} />
            <StatTile label="Shifts |S|" value={String(shiftCount)} />
            <StatTile
              label="log₁₀ of the space"
              value={searchSpace.rawLog10.toFixed(1)}
              sub="digits in the answer"
            />
          </div>

          <div className="rounded-md border bg-background/50 p-4 text-sm leading-relaxed">
            <div className="mb-2 font-medium">Brute force, taken seriously</div>
            <p className="text-muted-foreground">
              At a billion candidate schedules per second, enumerating this space takes{" "}
              <span className="font-medium text-foreground">
                {formatLog10Seconds(searchSpace.bruteForceLog10Seconds)}
              </span>
              . If every atom in the observable universe (~10<Sup>80</Sup>) were a
              billion-per-second computer running since the Big Bang, you would have
              checked about 10<Sup>106</Sup> schedules — roughly one{" "}
              {formatLog10(searchSpace.rawLog10 - 106.6)}
              <sup>th</sup> of this space. Exhaustive search is not slow here. It is not a
              thing.
            </p>
          </div>

          <Separator />

          <div>
            <div className="mb-1 text-sm font-medium">
              Constraints shrink the space — but nowhere near enough
            </div>
            <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
              &ldquo;Max one shift per day&rdquo; makes each day an injective assignment of
              that day&rsquo;s <M>k</M> shifts to distinct employees, which is a{" "}
              <M>k</M>-permutation. Days are independent under that constraint, so they
              multiply:
            </p>
            <Display label="one shift per day">
              <Sum under="days d" /> → <span className="mx-1">∏</span>
              <Sub>d</Sub> P(|E|, k<Sub>d</Sub>) = <span className="mx-1">∏</span>
              <Sub>d</Sub>{" "}
              <Frac
                over={
                  <>
                    |E|!
                  </>
                }
                under={
                  <>
                    (|E| − k<Sub>d</Sub>)!
                  </>
                }
              />{" "}
              ≈ {formatLog10(searchSpace.oneShiftPerDayLog10)}
            </Display>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Still astronomically large. Which is the real lesson: finding a{" "}
              <em>feasible</em> schedule is easy — a greedy pass does it in milliseconds.
              The hard problem is finding a <em>good</em> one among{" "}
              {formatLog10(searchSpace.oneShiftPerDayLog10)} feasible ones.
            </p>
          </div>

          <Separator />

          <div>
            <div className="mb-1 text-sm font-medium">What the solver actually looks at</div>
            <div className="grid gap-2 sm:grid-cols-3">
              <StatTile
                label="Change moves"
                value={formatNumber(searchSpace.changeMoveCount)}
                sub={`|S| × (|E| − 1) = ${shiftCount} × ${employeeCount - 1}`}
              />
              <StatTile
                label="Swap moves"
                value={formatNumber(searchSpace.swapMoveCount)}
                sub={`C(|S|, 2) = ${shiftCount}×${shiftCount - 1}/2`}
              />
              <StatTile
                label="Neighbourhood"
                value={formatNumber(searchSpace.neighbourhoodSize)}
                sub="candidates one step away"
                accent="var(--series-2)"
              />
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              A 30-second solve evaluates on the order of 10<Sup>6</Sup> candidates out of{" "}
              {formatLog10(searchSpace.rawLog10)} — a fraction of about 10
              <Sup>−{Math.round(searchSpace.rawLog10 - 6)}</Sup>. That this works at all is
              not luck. The score is a{" "}
              <span className="text-foreground">sum of local terms</span>, so the landscape
              has structure, and following the gradient gets close to optimal without
              seeing the space.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Orders of magnitude</CardTitle>
            <CardDescription>Log scale — each gridline is 10× the last many times over.</CardDescription>
          </CardHeader>
          <CardContent>
            <MagnitudeBars items={anchors} height={260} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Complexity class</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              Employee shift scheduling with skills and rest rules is{" "}
              <span className="font-medium text-foreground">NP-hard</span>. It contains
              graph colouring as a special case: shifts are vertices, &ldquo;cannot share an
              employee&rdquo; is an edge, employees are colours.
            </p>
            <p>
              No polynomial algorithm is known and none is expected. That single fact is
              the justification for the entire metaheuristic approach — abandon proving
              optimality, and instead get a very good answer inside a time budget you
              choose. Which then raises the question this page ends on: how do you know it
              is good?
            </p>
            <div className="pt-1">
              <Badge variant="secondary">
                C(|S|,2) = 10<Sup>{log10Combinations(shiftCount, 2).toFixed(1)}</Sup>
              </Badge>{" "}
              <Badge variant="secondary">
                P(|E|,3) = {formatNumber(Math.round(Math.pow(10, log10Permutations(employeeCount, 3))))}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ===========================================================================
// 2 · Score order
// ===========================================================================

function ScoreOrderSection() {
  const [a, setA] = useState({ hard: -1, soft: 1_000_000 });
  const [b, setB] = useState({ hard: 0, soft: -9999 });
  const comparison = compareScore(a, b);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Lexicographic order, not a weighted sum</CardTitle>
          <CardDescription>
            This is the single most important formal property of the score, and the reason
            you never have to invent a &ldquo;big enough&rdquo; weight for hard rules.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-relaxed">
          <Display label="comparison">
            compare(a, b) =
            <span className="ml-2 inline-flex flex-col text-left text-[13px]">
              <span>sign(a.hard − b.hard) if a.hard ≠ b.hard</span>
              <span>sign(a.soft − b.soft) otherwise</span>
            </span>
          </Display>

          <p className="text-muted-foreground">
            Scores are ordered by the lexicographic order on{" "}
            <M>
              ℤ × ℝ
            </M>
            . That is a total order, so any two scores are comparable — but it is{" "}
            <span className="font-medium text-foreground">not Archimedean</span>: there is
            no integer <M>k</M> with{" "}
            <M>
              k · (0, 1) &gt; (1, 0)
            </M>
            . No quantity of soft reward adds up to one unit of hard penalty.
          </p>

          <div className="rounded-md border-l-2 border-primary bg-background/50 p-3">
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-primary">
              Why this beats a single objective
            </div>
            <p className="text-muted-foreground">
              The alternative is one number:{" "}
              <M>
                score = w<Sub>hard</Sub> · violations + preferences
              </M>
              . Now you must choose <M>w<Sub>hard</Sub></M>. Too small and the optimiser
              sells a hard rule for enough soft gain. Too large and the soft term is lost
              to floating-point noise beside it. There is no correct value, only a range
              that happens to work for the instances you tested. Levels dissolve the
              question.
            </p>
          </div>

          <Separator />

          <div>
            <div className="mb-2 font-medium">Consequences worth internalising</div>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex gap-2">
                <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <span>
                  Soft score is <em>only</em> meaningful within a fixed hard level.
                  Comparing the soft scores of a feasible and an infeasible run tells you
                  nothing.
                </span>
              </li>
              <li className="flex gap-2">
                <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <span>
                  Any move reducing hard is accepted regardless of what it does to soft —
                  so the solver will happily wreck fairness to fix one overlap.
                </span>
              </li>
              <li className="flex gap-2">
                <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <span>
                  Timefold adds a third, dominating level:{" "}
                  <M>initScore</M> = −(unassigned entities). Comparison is really{" "}
                  <M>(initScore, hard, soft)</M>, which is what stops the empty schedule —
                  a flawless 0hard/0soft — from looking optimal.
                </span>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Try it</CardTitle>
          <CardDescription>Move the sliders and watch which score wins.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {[
            { label: "Score A", value: a, set: setA },
            { label: "Score B", value: b, set: setB },
          ].map((row) => (
            <div key={row.label} className="space-y-3 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{row.label}</span>
                <span className="font-mono text-xs tabular">
                  <span style={{ color: "var(--status-critical)" }}>
                    {row.value.hard}hard
                  </span>
                  <span className="text-muted-foreground">/</span>
                  <span style={{ color: "var(--status-warning)" }}>
                    {formatNumber(row.value.soft)}soft
                  </span>
                </span>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                  <span>hard</span>
                  <span className="tabular">{row.value.hard}</span>
                </div>
                <Slider
                  min={-20}
                  max={0}
                  step={1}
                  value={[row.value.hard]}
                  onValueChange={([next]) => row.set({ ...row.value, hard: next })}
                />
              </div>
              <div>
                <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                  <span>soft</span>
                  <span className="tabular">{formatNumber(row.value.soft)}</span>
                </div>
                <Slider
                  min={-1_000_000}
                  max={1_000_000}
                  step={1000}
                  value={[row.value.soft]}
                  onValueChange={([next]) => row.set({ ...row.value, soft: next })}
                />
              </div>
            </div>
          ))}

          <div
            className="rounded-md p-4 text-center"
            style={{
              background:
                comparison === 0
                  ? "color-mix(in srgb, var(--viz-ink-muted) 14%, transparent)"
                  : "color-mix(in srgb, var(--status-good) 14%, transparent)",
            }}
          >
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Better score
            </div>
            <div className="mt-1 text-xl font-semibold">
              {comparison === 0 ? "Equal" : comparison > 0 ? "Score A" : "Score B"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {a.hard !== b.hard
                ? `Decided at the hard level: ${a.hard} vs ${b.hard}. Soft never consulted.`
                : "Hard ties, so soft breaks the tie."}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ===========================================================================
// 3 · Weighers & gradients
// ===========================================================================

function GradientSection() {
  const [overlapMinutes, setOverlapMinutes] = useState(240);

  // A one-dimensional slice of the landscape: shifting one shift later reduces overlap.
  const samples = useMemo(
    () =>
      Array.from({ length: 49 }, (_, index) => {
        const minutes = 480 - index * 10;
        return {
          minutes: Math.max(0, minutes),
          gradient: -Math.max(0, minutes),
          flat: minutes > 0 ? -1 : 0,
        };
      }),
    [],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Selection and weighing are separate decisions</CardTitle>
          <CardDescription>
            Which tuples match is one question. What each match costs is another. Get the
            second one wrong and your score is <em>correct but unsearchable</em>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-relaxed">
          <p className="text-muted-foreground">
            Consider the overlapping-shift constraint. Both versions below agree perfectly
            on which schedules are legal, and on which schedule is optimal:
          </p>

          <div className="space-y-2">
            <div className="rounded-md border p-3">
              <div className="mb-1 flex items-center gap-2">
                <Badge variant="ok">gradient</Badge>
                <code className="text-xs">.penalize(ONE_HARD, ::getMinuteOverlap)</code>
              </div>
              <p className="text-xs text-muted-foreground">
                Cost falls smoothly as the overlap shrinks. Every partial improvement is
                visible to the search.
              </p>
            </div>
            <div className="rounded-md border p-3">
              <div className="mb-1 flex items-center gap-2">
                <Badge variant="hard">plateau</Badge>
                <code className="text-xs">.penalize(ONE_HARD)</code>
              </div>
              <p className="text-xs text-muted-foreground">
                Cost is 1 until the overlap hits exactly zero, then 0. A cliff at the end
                of a flat plain.
              </p>
            </div>
          </div>

          <p className="text-muted-foreground">
            With the flat weight, a move that cuts an 8-hour overlap to 10 minutes scores{" "}
            <em>identically</em> to doing nothing. Local search has no reason to take it,
            so the entire fix has to happen in a single move or not at all. The gradient
            version turns that cliff into a slope the search can walk down one step at a
            time.
          </p>

          <div className="rounded-md border-l-2 border-primary bg-background/50 p-3">
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-primary">
              The same argument, three more times
            </div>
            <ul className="space-y-1.5 text-muted-foreground">
              <li>
                <span className="text-foreground">Rest constraint</span> —{" "}
                <M>600 − gap</M> instead of a flat 1, so pushing a shift 30 minutes later
                is rewarded even while still illegal.
              </li>
              <li>
                <span className="text-foreground">Availability</span> — overlapping minutes
                instead of a flat 1, so trimming a night shift off an unavailable day pays.
              </li>
              <li>
                <span className="text-foreground">Balance</span> — a{" "}
                <em>fractional</em> unfairness rather than an integer, which is the entire
                reason this model uses <code className="text-xs">HardSoftBigDecimalScore</code>
                . Rounded to integers, thousands of distinct load vectors would collapse
                onto one score and the fairness landscape would be a plateau.
              </li>
            </ul>
          </div>

          <Separator />

          <p className="text-muted-foreground">
            The counter-example is instructive too:{" "}
            <span className="text-foreground">Missing required skill</span> is flat, and
            correctly so. A skill mismatch is binary — there is no &ldquo;more
            wrong&rdquo; — and inventing a weigher would encode a distinction that does not
            exist in the world.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">The landscape, one dimension of it</CardTitle>
          <CardDescription>
            Horizontal axis: minutes of overlap remaining as you push one shift later.
            Vertical: the hard-score contribution.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <LandscapePlot samples={samples} current={overlapMinutes} />

          <div>
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>Overlap remaining</span>
              <span className="tabular">{overlapMinutes} min</span>
            </div>
            <Slider
              min={0}
              max={480}
              step={10}
              value={[overlapMinutes]}
              onValueChange={([next]) => setOverlapMinutes(next)}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <StatTile
              label="Gradient weigher"
              value={String(-overlapMinutes)}
              sub="responds to every 10-minute step"
              accent="var(--series-1)"
            />
            <StatTile
              label="Flat weigher"
              value={String(overlapMinutes > 0 ? -1 : 0)}
              sub="flat until it snaps to 0"
              accent="var(--series-2)"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LandscapePlot({
  samples,
  current,
}: {
  samples: Array<{ minutes: number; gradient: number; flat: number }>;
  current: number;
}) {
  const width = 460;
  const height = 220;
  const padding = { top: 14, right: 12, bottom: 30, left: 44 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const x = (minutes: number) => padding.left + ((480 - minutes) / 480) * plotWidth;
  const yGradient = (value: number) => padding.top + (-value / 480) * plotHeight;
  const yFlat = (value: number) => padding.top + (-value / 1) * plotHeight;

  const gradientPath = samples
    .map((s, i) => `${i === 0 ? "M" : "L"}${x(s.minutes)},${yGradient(s.gradient)}`)
    .join(" ");
  const flatPath = samples
    .map((s, i) => `${i === 0 ? "M" : "L"}${x(s.minutes)},${yFlat(s.flat)}`)
    .join(" ");

  return (
    <div>
      {/* Two series, so a legend is present; dash pattern carries identity as well as hue. */}
      <div className="mb-2 flex items-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <svg width="18" height="6" aria-hidden>
            <line x1="0" y1="3" x2="18" y2="3" stroke="var(--series-1)" strokeWidth="2" />
          </svg>
          gradient (minutes)
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="18" height="6" aria-hidden>
            <line
              x1="0"
              y1="3"
              x2="18"
              y2="3"
              stroke="var(--series-2)"
              strokeWidth="2"
              strokeDasharray="4 3"
            />
          </svg>
          flat (rescaled to fit)
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label="Score contribution as overlap decreases, for a gradient weigher versus a flat weigher."
      >
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={padding.left}
            y1={padding.top + f * plotHeight}
            x2={width - padding.right}
            y2={padding.top + f * plotHeight}
            stroke="var(--viz-grid)"
          />
        ))}
        <line
          x1={padding.left}
          y1={padding.top}
          x2={padding.left}
          y2={padding.top + plotHeight}
          stroke="var(--viz-axis)"
        />
        <path d={flatPath} fill="none" stroke="var(--series-2)" strokeWidth={2} strokeDasharray="4 3" />
        <path d={gradientPath} fill="none" stroke="var(--series-1)" strokeWidth={2} />

        <line
          x1={x(current)}
          y1={padding.top}
          x2={x(current)}
          y2={padding.top + plotHeight}
          stroke="var(--viz-ink-muted)"
          strokeDasharray="3 3"
        />
        <circle cx={x(current)} cy={yGradient(-current)} r={4.5} fill="var(--series-1)" stroke="var(--viz-surface)" strokeWidth={2} />
        <circle
          cx={x(current)}
          cy={yFlat(current > 0 ? -1 : 0)}
          r={4.5}
          fill="var(--series-2)"
          stroke="var(--viz-surface)"
          strokeWidth={2}
        />

        <text x={padding.left} y={height - 8} fontSize={10} fill="var(--viz-ink-muted)">
          480 min overlap
        </text>
        <text
          x={width - padding.right}
          y={height - 8}
          textAnchor="end"
          fontSize={10}
          fill="var(--viz-ink-muted)"
        >
          0 (resolved)
        </text>
        <text
          x={padding.left - 6}
          y={padding.top + 4}
          textAnchor="end"
          fontSize={10}
          fill="var(--viz-ink-muted)"
        >
          0
        </text>
        <text
          x={padding.left - 6}
          y={padding.top + plotHeight}
          textAnchor="end"
          fontSize={10}
          fill="var(--viz-ink-muted)"
        >
          worst
        </text>
      </svg>
      <p className="mt-1 text-xs text-muted-foreground">
        The flat series is drawn on its own scale purely so both are visible — the point is
        its <em>shape</em>, not its height. Notice it is perfectly level across the whole
        plain: nothing to follow until the very last step.
      </p>
    </div>
  );
}

// ===========================================================================
// 4 · Load balancing
// ===========================================================================

function LoadBalanceSection() {
  const { explanation, schedule } = useScheduleState();
  const [manual, setManual] = useState<number[]>([6, 1, 1, 1, 1]);

  const live = useMemo(() => loadBreakdown(explanation.loads), [explanation.loads]);

  const manualStats = useMemo(() => {
    const total = manual.reduce((a, b) => a + b, 0);
    const mean = total / manual.length;
    const rows = manual.map((load, index) => {
      const deviation = load - mean;
      return {
        item: `E${index + 1}`,
        load,
        deviation,
        squaredDeviation: deviation * deviation,
      };
    });
    return {
      rows,
      total,
      mean,
      sumSquared: rows.reduce((a, r) => a + r.squaredDeviation, 0),
      sumAbsolute: rows.reduce((a, r) => a + Math.abs(r.deviation), 0),
      unfairness: unfairnessDirect(manual),
      stdDev: loadStandardDeviation(manual),
    };
  }, [manual]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>What unfairness() actually computes</CardTitle>
          <CardDescription>
            The Javadoc only says &ldquo;dimensionless, lower is fairer&rdquo;. The source
            says more. Below is the derivation from{" "}
            <code className="text-xs">DefaultLoadBalance.java</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-relaxed">
          <p className="text-muted-foreground">
            The class keeps two running totals over the loads{" "}
            <M>
              x<Sub>1</Sub>…x<Sub>n</Sub>
            </M>{" "}
            and combines them at the end:
          </p>

          <div className="rounded-md border bg-background/50 p-4 font-mono text-xs leading-relaxed">
            <div className="text-muted-foreground">
              squaredDeviationIntegralPart accumulates{" "}
              <span className="text-foreground">Σ xᵢ²</span>
            </div>
            <div className="text-muted-foreground">
              squaredDeviationFractionNumerator accumulates{" "}
              <span className="text-foreground">−S²</span>{" "}
              <span className="opacity-70">where S = Σ xᵢ</span>
            </div>
            <div className="mt-2 text-muted-foreground">
              return <span className="text-foreground">sqrt(numerator / n + integralPart)</span>
            </div>
          </div>

          <Display label="so">
            unfairness = <Sqrt>
              <Sum under="i" />x<Sub>i</Sub>
              <Sup>2</Sup> − <Frac over={<>S<Sup>2</Sup></>} under="n" />
            </Sqrt>
          </Display>

          <div className="rounded-md border p-4">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-primary">
              That expression is the sum of squared deviations
            </div>
            <div className="divide-y">
              <Step
                expression={
                  <>
                    <Sum under="i" />(x<Sub>i</Sub> − x̄)<Sup>2</Sup> = <Sum under="i" />x
                    <Sub>i</Sub>
                    <Sup>2</Sup> − 2x̄<Sum under="i" />x<Sub>i</Sub> + n·x̄<Sup>2</Sup>
                  </>
                }
                because="expand the square"
              />
              <Step
                expression={
                  <>
                    = <Sum under="i" />x<Sub>i</Sub>
                    <Sup>2</Sup> − 2·<Frac over="S" under="n" />·S + n·
                    <Frac over={<>S<Sup>2</Sup></>} under={<>n<Sup>2</Sup></>} />
                  </>
                }
                because={<>substitute x̄ = S / n</>}
              />
              <Step
                expression={
                  <>
                    = <Sum under="i" />x<Sub>i</Sub>
                    <Sup>2</Sup> − <Frac over={<>2S<Sup>2</Sup></>} under="n" /> +{" "}
                    <Frac over={<>S<Sup>2</Sup></>} under="n" />
                  </>
                }
                because="simplify each term"
              />
              <Step
                expression={
                  <>
                    = <Sum under="i" />x<Sub>i</Sub>
                    <Sup>2</Sup> − <Frac over={<>S<Sup>2</Sup></>} under="n" />
                    <span className="ml-3 text-muted-foreground">∎</span>
                  </>
                }
                because="collect — this is exactly what the source returns"
              />
            </div>
          </div>

          <Display label="the punchline">
            unfairness = <Sqrt>
              <Sum under="i" />(x<Sub>i</Sub> − x̄)<Sup>2</Sup>
            </Sqrt>{" "}
            = σ · <Sqrt>n</Sqrt>
          </Display>

          <div className="rounded-md border-l-2 p-3" style={{ borderColor: "var(--status-serious)" }}>
            <div className="mb-1 text-xs font-medium uppercase tracking-wide" style={{ color: "var(--status-serious)" }}>
              It is not the standard deviation
            </div>
            <p className="text-muted-foreground">
              It is the <span className="text-foreground">Euclidean distance</span> from the
              load vector <M>x</M> to the perfectly balanced vector{" "}
              <M>(x̄, x̄, …, x̄)</M> — the L2 norm of the deviation vector. It equals{" "}
              <M>σ·√n</M>, so it grows with the size of your workforce even at constant
              per-person variance. That is why the docs warn that unfairness is only
              comparable between solutions <em>with the same set of balanced items</em>.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Why squared, not absolute</CardTitle>
            <CardDescription>
              Drag the loads. Watch the two metrics disagree — that disagreement is the
              entire argument.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {[
                { label: "Perfect", loads: [2, 2, 2, 2, 2] },
                { label: "Slightly off", loads: [3, 2, 2, 2, 1] },
                { label: "One outlier", loads: [6, 1, 1, 1, 1] },
                { label: "Two idle", loads: [4, 3, 3, 0, 0] },
              ].map((preset) => (
                <Button
                  key={preset.label}
                  size="sm"
                  variant={
                    preset.loads.join() === manual.join() ? "default" : "outline"
                  }
                  onClick={() => setManual(preset.loads)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>

            <div className="space-y-2">
              {manual.map((load, index) => (
                <div key={index} className="flex items-center gap-3">
                  <span className="w-8 shrink-0 font-mono text-xs text-muted-foreground">
                    E{index + 1}
                  </span>
                  <Slider
                    className="flex-1"
                    min={0}
                    max={10}
                    step={1}
                    value={[load]}
                    onValueChange={([next]) =>
                      setManual((prev) => prev.map((v, i) => (i === index ? next : v)))
                    }
                  />
                  <span className="w-6 text-right font-mono text-xs tabular">{load}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <StatTile
                label="Σ|xᵢ − x̄|  (L1)"
                value={formatNumber(manualStats.sumAbsolute, 2)}
                sub="what absolute deviation would charge"
              />
              <StatTile
                label="Σ(xᵢ − x̄)²  (L2²)"
                value={formatNumber(manualStats.sumSquared, 2)}
                sub="what the solver squares"
                accent="var(--series-1)"
              />
              <StatTile
                label="unfairness = √Σ(xᵢ − x̄)²"
                value={formatNumber(manualStats.unfairness, 5)}
                sub="the actual soft penalty"
                accent="var(--status-warning)"
              />
              <StatTile
                label="σ (population)"
                value={formatNumber(manualStats.stdDev, 5)}
                sub={`= unfairness / √${manual.length}`}
              />
            </div>

            <DeviationChart rows={manualStats.rows} height={160} />

            <p className="text-xs leading-relaxed text-muted-foreground">
              Try <span className="text-foreground">Slightly off</span> versus{" "}
              <span className="text-foreground">One outlier</span>: L1 goes 2 → 8, only 4×
              worse. The squared sum goes 2 → 20, a full 10× worse. With absolute deviation
              the solver would be nearly indifferent between spreading imbalance thinly and
              dumping it on one person. Squaring makes it care.
            </p>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your current schedule</CardTitle>
              <CardDescription>
                {formatNumber(live.total)} assigned shifts over {live.rows.length} employees.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <LoadDistribution rows={live.rows} mean={live.mean} height={200} />
              <div className="grid grid-cols-3 gap-2">
                <StatTile label="Mean x̄" value={formatNumber(live.mean, 2)} />
                <StatTile
                  label="unfairness"
                  value={formatNumber(live.unfairness, 4)}
                  accent="var(--status-warning)"
                />
                <StatTile label="σ" value={formatNumber(live.stdDev, 4)} />
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                The soft score charges exactly{" "}
                <span className="font-mono text-foreground">
                  −{formatNumber(live.unfairness, 4)}
                </span>{" "}
                for this distribution — one single constraint match for the entire
                schedule.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">The O(1) update</CardTitle>
              <CardDescription>
                Why load balancing does not destroy solver throughput.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-relaxed">
              <p className="text-muted-foreground">
                Moving one shift from employee <M>a</M> to employee <M>b</M> leaves the
                total <M>S</M> unchanged and shifts two squares:
              </p>
              <Display label="delta">
                Δ<Sum under="i" />x<Sub>i</Sub>
                <Sup>2</Sup> = ((x<Sub>a</Sub>−1)<Sup>2</Sup> − x<Sub>a</Sub>
                <Sup>2</Sup>) + ((x<Sub>b</Sub>+1)<Sup>2</Sup> − x<Sub>b</Sub>
                <Sup>2</Sup>) = 2(x<Sub>b</Sub> − x<Sub>a</Sub> + 1)
              </Display>
              <p className="text-muted-foreground">
                Two multiplications, no pass over the load vector. Note the sign: the delta
                is negative — fairness <em>improves</em> — exactly when{" "}
                <M>x<Sub>b</Sub> &lt; x<Sub>a</Sub> − 1</M>, i.e. when you take work from
                someone with strictly more than one extra shift. The metric encodes
                &ldquo;move work downhill&rdquo; as arithmetic.
              </p>
              <p className="text-xs text-muted-foreground">
                Timefold&rsquo;s actual accumulator is more general than this (it handles
                arbitrary load metrics, not just counts), but the principle is the same and
                the port implements both — with a test asserting they agree over hundreds
                of random update sequences.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// 5 · Feasibility bound
// ===========================================================================

function FeasibilityBoundSection() {
  const { feasibility, schedule, applyFeasibleSeed, seed, dataset } = useScheduleState();
  const shortDays = feasibility.days.filter((day) => day.deficiency > 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>How do you know whether the solver did well?</CardTitle>
          <CardDescription>
            &ldquo;It reached −3hard&rdquo; means nothing on its own. Maybe the optimum is 0
            and the search is weak; maybe the optimum <em>is</em> −3. Without a lower bound
            you cannot tell — and this is the most common way people misjudge an optimiser.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-relaxed">
          <div
            className="rounded-md p-4"
            style={{
              background: feasibility.feasible
                ? "color-mix(in srgb, var(--status-good) 12%, transparent)"
                : "color-mix(in srgb, var(--status-critical) 12%, transparent)",
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Provable bound for {dataset} (seed {seed})
                </div>
                <div className="mt-1 text-2xl font-semibold tabular">
                  {feasibility.hardScoreUpperBound} hard
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {feasibility.feasible
                    ? "No structural shortage — 0hard is reachable."
                    : `${feasibility.totalDeficiency} shift${feasibility.totalDeficiency === 1 ? "" : "s"} MUST break a hard constraint, across ${shortDays.length} day${shortDays.length === 1 ? "" : "s"}.`}
                </div>
              </div>
              {!feasibility.feasible ? (
                <Button variant="outline" size="sm" onClick={() => applyFeasibleSeed()}>
                  Find a feasible seed
                </Button>
              ) : null}
            </div>
          </div>

          <div>
            <div className="mb-2 font-medium">The argument</div>
            <ol className="space-y-2 text-muted-foreground">
              <li>
                <span className="text-foreground">1.</span> &ldquo;Max one shift per
                day&rdquo; forces the assignment of a single day&rsquo;s shifts to be{" "}
                <span className="text-foreground">injective</span> — no employee twice.
              </li>
              <li>
                <span className="text-foreground">2.</span> Call an assignment{" "}
                <em>free</em> if it costs no hard points: the employee holds the required
                skill and has not marked the day unavailable. For each day, build a
                bipartite graph — shifts on the left, employees on the right, an edge for
                every free pairing.
              </li>
              <li>
                <span className="text-foreground">3.</span> A zero-cost day exists iff that
                graph has a matching saturating the shifts. By{" "}
                <span className="text-foreground">Hall&rsquo;s marriage theorem</span> that
                holds iff every set <M>S</M> of shifts satisfies{" "}
                <M>|N(S)| ≥ |S|</M>.
              </li>
              <li>
                <span className="text-foreground">4.</span> When it fails, the{" "}
                <span className="text-foreground">deficiency version</span> gives the exact
                shortfall, and every unmatched shift costs at least 1 (the cheapest hard
                violation in this model being a flat-weight skill mismatch).
              </li>
            </ol>
          </div>

          <Display label="Hall's deficiency">
            max matching = |shifts| − max<Sub>S</Sub>(|S| − |N(S)|)
            <span className="mx-3">⟹</span>
            best hard ≤ −<Sum under="days d" />deficiency(d)
          </Display>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md border-l-2 border-primary bg-background/50 p-3">
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-primary">
                Why this is computable when the full problem is NP-hard
              </div>
              <p className="text-xs text-muted-foreground">
                Bipartite matching is polynomial — Kuhn&rsquo;s augmenting-path algorithm is
                O(V·E). Dropping the rest constraint and the whole soft level lands the
                problem in a tractable class. Solving a relaxation to bound the original is
                the standard move in optimisation, and it is also the answer to
                &ldquo;isn&rsquo;t this just brute force with extra steps?&rdquo; — structure
                is exploitable, you just cannot exploit all of it at once.
              </p>
            </div>
            <div
              className="rounded-md border-l-2 bg-background/50 p-3"
              style={{ borderColor: "var(--status-serious)" }}
            >
              <div
                className="mb-1 text-xs font-medium uppercase tracking-wide"
                style={{ color: "var(--status-serious)" }}
              >
                It is a bound, not the optimum
              </div>
              <p className="text-xs text-muted-foreground">
                The 10-hour rest constraint couples adjacent days, and this per-day
                relaxation cannot see that coupling. So the true optimum sits somewhere in
                [bound, whatever the solver found]. If the solver reaches the bound it is
                provably optimal on the hard level; if it lands one or two short, you have
                genuinely narrowed it down rather than guessing.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per-day matching</CardTitle>
          <CardDescription>
            Days with a deficiency are the ones that make your instance impossible.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Date</th>
                  <th className="py-2 pr-4 font-medium">Shifts</th>
                  <th className="py-2 pr-4 font-medium">Max free matching</th>
                  <th className="py-2 pr-4 font-medium">Deficiency</th>
                  <th className="py-2 font-medium">Tightest skill (demand / supply)</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {feasibility.days.map((day) => {
                  const tightest = day.skillPressure[0];
                  const short = day.deficiency > 0;
                  return (
                    <tr key={day.date} className="border-b border-border/50">
                      <td className="py-1.5 pr-4 font-mono text-xs">{day.date}</td>
                      <td className="py-1.5 pr-4">{day.shiftCount}</td>
                      <td className="py-1.5 pr-4">{day.maxMatching}</td>
                      <td className="py-1.5 pr-4">
                        {short ? (
                          <span
                            className="rounded px-1.5 py-0.5 text-xs font-medium"
                            style={{
                              background:
                                "color-mix(in srgb, var(--status-critical) 18%, transparent)",
                              color: "var(--status-critical)",
                            }}
                          >
                            −{day.deficiency}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="py-1.5 text-xs text-muted-foreground">
                        {tightest
                          ? `${tightest.skill}: ${tightest.demand} / ${tightest.supply}`
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ===========================================================================
// 6 · Incremental scoring
// ===========================================================================

function IncrementalSection() {
  const { schedule, toggles, searchSpace } = useScheduleState();
  const [result, setResult] = useState<{
    incremental: number;
    full: number;
    speedup: number;
  } | null>(null);
  const [running, setRunning] = useState(false);

  const run = () => {
    setRunning(true);
    // Yield a frame so the button state paints before the blocking benchmark.
    setTimeout(() => {
      setResult(benchmarkScoreModes(schedule, toggles, 2500));
      setRunning(false);
    }, 30);
  };

  const employeeCount = schedule.employees.length;
  const shiftCount = schedule.shifts.length;
  const shiftsPerEmployee = shiftCount / Math.max(1, employeeCount);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>The score is a sum over employees</CardTitle>
          <CardDescription>
            This is not an optimisation trick — it is a structural property of this
            constraint set, and it is the reason a solver can evaluate hundreds of
            thousands of candidates per second.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-relaxed">
          <p className="text-muted-foreground">
            Constraints 1–7 all filter on{" "}
            <code className="text-xs">shift.employee</code>. No constraint relates two
            different employees to each other. So the score decomposes:
          </p>

          <Display label="decomposition">
            score(solution) = <Sum under="e ∈ E" />f(e, shifts<Sub>e</Sub>) − unfairness(loads)
          </Display>

          <p className="text-muted-foreground">
            A change move reassigns one shift, so it can only alter{" "}
            <span className="text-foreground">two</span> of those{" "}
            {employeeCount} terms. Recompute those two, leave the rest, and add the O(1)
            unfairness delta.
          </p>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-md border p-3">
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Full recalculation
              </div>
              <div className="font-mono text-sm">
                ≈ Σ<Sub>e</Sub> k<Sub>e</Sub>
                <Sup>2</Sup> ≈ {formatNumber(employeeCount * shiftsPerEmployee ** 2)} pair
                checks
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                every employee, every pair, every move
              </div>
            </div>
            <div className="rounded-md border p-3" style={{ borderColor: "var(--series-1)" }}>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Incremental
              </div>
              <div className="font-mono text-sm">
                ≈ 2·k<Sup>2</Sup> ≈ {formatNumber(2 * shiftsPerEmployee ** 2)} pair checks
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                two employees, plus O(1) for balance
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <div className="mb-2 font-medium">The other four speedups in the port</div>
            <ul className="space-y-1.5 text-muted-foreground">
              <li>
                <span className="text-foreground">Precomputation.</span> Parsing timestamps
                and computing a shift&rsquo;s overlap with its own dates are properties of
                the shift, not the assignment. Done once.
              </li>
              <li>
                <span className="text-foreground">Sets instead of arrays.</span>{" "}
                <code className="text-xs">skills.includes(s)</code> is a linear scan;
                hashing makes it O(1). This is the same idea as a constraint-stream{" "}
                <em>joiner</em> versus a <em>filter</em> — build an index once, probe it
                many times.
              </li>
              <li>
                <span className="text-foreground">An early break in the pair loop.</span>{" "}
                With shifts sorted by start time, once <M>b.start</M> is past{" "}
                <M>a.end + 10h</M> (and past midnight after <M>a.start</M>) no later shift
                can overlap, breach rest, or share a date. An employee&rsquo;s ~
                {shiftsPerEmployee.toFixed(0)} shifts are spread over the whole horizon, so
                almost every pair is skipped.
              </li>
              <li>
                <span className="text-foreground">No allocation in the hot path.</span> No
                arrays, no closures, no sorting per call — results are written into a
                reused two-element buffer.
              </li>
            </ul>
          </div>

          <div className="rounded-md border-l-2 border-primary bg-background/50 p-3">
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-primary">
              Keep both implementations
            </div>
            <p className="text-xs text-muted-foreground">
              Timefold ships the same duality: an <code>EasyScoreCalculator</code> that is
              readable and recomputes everything, and the indexed incremental constraint-stream
              engine. The recommended workflow is to write the easy one first and use it to
              verify the fast one. This port does exactly that —{" "}
              <code className="text-xs">constraints.ts</code> is the reference,{" "}
              <code className="text-xs">fastEval.ts</code> is the engine, and the test suite
              asserts they agree over thousands of random states. If they ever diverge, the
              readable one is right by definition.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Measure it on this machine</CardTitle>
          <CardDescription>
            Identical moves, identical seed. Only the scoring strategy differs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={run} disabled={running} className="w-full">
            {running ? (
              <>
                <Loader2 className="animate-spin" /> Benchmarking…
              </>
            ) : (
              <>
                <Calculator /> Run the benchmark
              </>
            )}
          </Button>

          {result ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <StatTile
                  label="Incremental"
                  value={`${formatNumber(result.incremental)} /s`}
                  sub="moves evaluated per second"
                  accent="var(--series-1)"
                />
                <StatTile
                  label="Full recalculation"
                  value={`${formatNumber(result.full)} /s`}
                  sub="moves evaluated per second"
                  accent="var(--series-2)"
                />
              </div>
              <div
                className="rounded-md p-4 text-center"
                style={{
                  background: "color-mix(in srgb, var(--status-good) 12%, transparent)",
                }}
              >
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Speedup
                </div>
                <div className="mt-1 text-3xl font-semibold tabular">
                  {formatNumber(result.speedup, 1)}×
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  on {shiftCount} shifts and {employeeCount} employees
                </div>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Multiply the difference by a 30-second budget: that is the gap between
                exploring ~10<Sup>5</Sup> candidates and ~10<Sup>7</Sup>. Same algorithm,
                same acceptor, same everything — and a materially better answer, purely
                because it got more attempts.
              </p>
            </>
          ) : (
            <p className="text-xs leading-relaxed text-muted-foreground">
              The benchmark runs a construction heuristic then ~2,500 local-search moves
              under each strategy. It blocks the UI for a second or two, which is itself
              informative about how much work a solver does per move.
            </p>
          )}

          <Separator />

          <div className="space-y-2 text-xs text-muted-foreground">
            <div className="font-medium text-foreground">For reference</div>
            <div className="flex justify-between tabular">
              <span>Neighbourhood size</span>
              <span>{formatNumber(searchSpace.neighbourhoodSize)}</span>
            </div>
            <div className="flex justify-between tabular">
              <span>Shifts per employee (mean)</span>
              <span>{formatNumber(shiftsPerEmployee, 1)}</span>
            </div>
            <div className="flex justify-between tabular">
              <span>Timefold default budget</span>
              <span>30 s</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
