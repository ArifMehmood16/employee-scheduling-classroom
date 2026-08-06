import { Link } from "react-router-dom";
import {
  ArrowRight,
  Braces,
  FlaskConical,
  GitFork,
  Play,
  Sigma,
  SquareStack,
  BookOpen,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/ScoreDisplay";
import { useScheduleState } from "@/state/ScheduleContext";
import { formatNumber } from "@/lib/utils";
import { formatLog10 } from "@/timefold/searchSpace";
import { CONSTRAINTS } from "@/timefold/constraints";

const SURFACES = [
  {
    to: "/learn",
    icon: BookOpen,
    title: "Classroom",
    blurb:
      "Ten lessons in order, each with checkable outcomes and a checkpoint question. Start here if you want a route rather than a map.",
  },
  {
    to: "/map",
    icon: GitFork,
    title: "Mindmap",
    blurb:
      "The whole quickstart on one canvas — data in, model, score, search, service. Click any node for the reasoning.",
  },
  {
    to: "/code",
    icon: Braces,
    title: "Annotated source",
    blurb:
      "The real Java from your checkout, line numbers intact, with notes on every consequential line and what breaks without it.",
  },
  {
    to: "/lab",
    icon: FlaskConical,
    title: "Constraint Lab",
    blurb:
      "Score a schedule, drag shifts between people, switch rules off. A port of the quickstart's /analyze endpoint, made interactive.",
  },
  {
    to: "/math",
    icon: Sigma,
    title: "Maths & statistics",
    blurb:
      "Search-space combinatorics, lexicographic ordering, the unfairness derivation, Hall's-theorem bounds, and a live scoring benchmark.",
  },
  {
    to: "/solve",
    icon: Play,
    title: "Solver",
    blurb:
      "A real construction heuristic and local search running in this tab, with a move-by-move inspector and an acceptor race.",
  },
  {
    to: "/cards",
    icon: SquareStack,
    title: "Cards & quiz",
    blurb:
      "Forty-odd flashcards and a ten-question quiz whose distractors are all beliefs people actually hold.",
  },
];

export default function Home() {
  const { schedule, searchSpace, feasibility, dataset } = useScheduleState();

  return (
    <div className="space-y-8">
      <section className="pt-4">
        <Badge variant="secondary" className="mb-3">
          TimefoldAI / timefold-quickstarts · use-cases/employee-scheduling
        </Badge>
        <h1 className="max-w-4xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          Take the employee-scheduling quickstart apart, then rebuild it in your head
        </h1>
        <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-muted-foreground">
          Eight constraints, one planning variable, and a search space of{" "}
          <span className="font-medium text-foreground">
            {formatLog10(searchSpace.rawLog10)}
          </span>{" "}
          candidate schedules. This tool contains a working TypeScript port of the model,
          the constraint engine and the solver, so every number you see is computed rather
          than quoted — and every formula is derived from the Java source rather than
          paraphrased from the docs.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button asChild size="lg">
            <Link to="/learn">
              Start the classroom <ArrowRight />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/solve">
              <Play /> Just run the solver
            </Link>
          </Button>
          <Button asChild size="lg" variant="ghost">
            <Link to="/math">
              <Sigma /> Go straight to the maths
            </Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={`${dataset} dataset`}
          value={`${schedule.shifts.length} shifts`}
          sub={`${schedule.employees.length} employees · ${searchSpace.shiftsPerDay.length} days`}
        />
        <StatTile
          label="Search space"
          value={formatLog10(searchSpace.rawLog10)}
          sub="|E| ^ |S| — more than Go positions"
          accent="var(--series-1)"
        />
        <StatTile
          label="Neighbourhood"
          value={formatNumber(searchSpace.neighbourhoodSize)}
          sub="candidates one move away"
          accent="var(--series-2)"
        />
        <StatTile
          label="Provable hard bound"
          value={`${feasibility.hardScoreUpperBound}`}
          sub={
            feasibility.feasible
              ? "instance is feasible — 0 is reachable"
              : `${feasibility.totalDeficiency} shifts must break a rule`
          }
          accent={feasibility.feasible ? "var(--status-good)" : "var(--status-critical)"}
        />
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold tracking-tight">Three things most write-ups get wrong</h2>
        <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
          Each of these came out of building the port, and each one is checkable — the test
          suite asserts the first, the source proves the second, and the third is why your
          solver looks like it is failing when it is not.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">unfairness() is not the standard deviation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs leading-relaxed text-muted-foreground">
                The docs only say &ldquo;dimensionless, lower is fairer&rdquo;. The source
                computes <span className="font-mono text-foreground">√(Σ(xᵢ − x̄)²)</span> —
                the Euclidean distance from a perfectly balanced load vector, which equals{" "}
                <span className="font-mono text-foreground">σ·√n</span>. Full derivation on
                the maths page.
              </p>
              <Button asChild size="sm" variant="link" className="h-auto p-0 text-xs">
                <Link to="/math">See the derivation →</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">The empty schedule scores 0hard/0soft</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs leading-relaxed text-muted-foreground">
                <span className="font-mono text-foreground">forEach(Shift.class)</span>{" "}
                silently skips shifts whose planning variable is null, so an entirely
                unassigned schedule looks flawless. Timefold&rsquo;s separate{" "}
                <span className="font-mono text-foreground">initScore</span> level is what
                stops the solver latching onto it.
              </p>
              <Button asChild size="sm" variant="link" className="h-auto p-0 text-xs">
                <Link to="/code?file=EmployeeSchedulingConstraintProvider">
                  Read the constraint file →
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">The shipped dataset is infeasible</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs leading-relaxed text-muted-foreground">
                At the default seed, some days demand more Doctor shifts than there are
                available Doctors. A solver stalling at −3hard there is not weak — it is
                optimal. A bipartite-matching bound tells you which case you are in.
              </p>
              <Button asChild size="sm" variant="link" className="h-auto p-0 text-xs">
                <Link to="/math">See the bound →</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold tracking-tight">Where to go</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SURFACES.map((surface) => {
            const Icon = surface.icon;
            return (
              <Link key={surface.to} to={surface.to} className="group">
                <Card className="h-full transition-colors group-hover:border-primary/50">
                  <CardHeader className="pb-2">
                    <div className="mb-1 flex items-center gap-2">
                      <Icon className="h-4 w-4 text-primary" />
                      <CardTitle className="text-sm">{surface.title}</CardTitle>
                    </div>
                    <CardDescription className="text-xs leading-relaxed">
                      {surface.blurb}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold tracking-tight">The eight constraints</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Five hard, three soft, one of which is a reward. Notice how many of the weights
          are a <em>measurement</em> rather than a flat 1 — that choice is what makes the
          score searchable.
        </p>
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-card text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Constraint</th>
                <th className="px-4 py-2.5 font-medium">Level</th>
                <th className="px-4 py-2.5 font-medium">Weight</th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">In plain English</th>
              </tr>
            </thead>
            <tbody>
              {CONSTRAINTS.map((constraint) => (
                <tr key={constraint.id} className="border-b border-border/50 last:border-b-0">
                  <td className="px-4 py-2.5 font-medium">{constraint.name}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant={constraint.level === "HARD" ? "hard" : "soft"}>
                      {constraint.level}
                      {constraint.direction === "REWARD" ? " ↑" : ""}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">
                    {constraint.weightFormula}
                  </td>
                  <td className="hidden px-4 py-2.5 text-xs text-muted-foreground md:table-cell">
                    {constraint.plainEnglish}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
