import { type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  BookOpen,
  Braces,
  FlaskConical,
  GitFork,
  Layers,
  Play,
  Sigma,
  SquareStack,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useScheduleState } from "@/state/ScheduleContext";
import { ScorePill } from "@/components/ScoreDisplay";
import { Badge } from "@/components/ui/badge";

const NAV = [
  { to: "/learn", label: "Classroom", icon: BookOpen },
  { to: "/map", label: "Mindmap", icon: GitFork },
  { to: "/code", label: "Code", icon: Braces },
  { to: "/lab", label: "Constraint Lab", icon: FlaskConical },
  { to: "/math", label: "Maths & Stats", icon: Sigma },
  { to: "/solve", label: "Solver", icon: Play },
  { to: "/cards", label: "Cards", icon: SquareStack },
];

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { explanation, dataset, schedule, feasibility } = useScheduleState();

  return (
    <div className="min-h-screen bg-background lg:flex">
      {/* Left sidebar */}
      <aside className="sticky top-0 z-40 hidden h-screen w-60 shrink-0 flex-col border-r bg-card/60 lg:flex">
        <Link to="/" className="flex items-center gap-2 border-b px-4 py-4">
          <Layers className="h-5 w-5 text-primary" />
          <span className="text-sm font-semibold leading-tight tracking-tight">
            Employee Scheduling
            <span className="block text-xs font-normal text-muted-foreground">Classroom</span>
          </span>
        </Link>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
          {NAV.map((item) => {
            const active = location.pathname === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-2 border-t p-3 text-xs text-muted-foreground">
          <div>
            {dataset} · {schedule.shifts.length} shifts · {schedule.employees.length} staff
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {!feasibility.feasible ? (
              <Badge variant="hard">bound {feasibility.hardScoreUpperBound}hard</Badge>
            ) : null}
            {explanation.unassignedCount > 0 ? (
              <Badge variant="soft">{explanation.unassignedCount} unassigned</Badge>
            ) : null}
            <ScorePill score={explanation.score} />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header + nav */}
        <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur lg:hidden">
          <div className="flex h-14 items-center gap-3 px-4">
            <Link to="/" className="flex shrink-0 items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              <span className="text-sm font-semibold tracking-tight">Employee Scheduling</span>
            </Link>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {explanation.unassignedCount > 0 ? (
                <Badge variant="soft" className="hidden sm:inline-flex">
                  {explanation.unassignedCount} unassigned
                </Badge>
              ) : null}
              <ScorePill score={explanation.score} />
            </div>
          </div>
          <nav className="flex gap-0.5 overflow-x-auto border-t px-3 py-1.5">
            {NAV.map((item) => {
              const active = location.pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium",
                    active ? "bg-primary/10 text-primary" : "text-muted-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>

        <main className="mx-auto w-full max-w-[1400px] px-6 py-8">{children}</main>

        <footer className="mt-12 border-t px-6 py-6">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span>
              A study tool for the Timefold employee-scheduling quickstart. The solver here is an
              independent TypeScript port, verified against hand-computed cases.
            </span>
            <a
              className="underline underline-offset-2 hover:text-foreground"
              href="https://github.com/TimefoldAI/timefold-quickstarts"
              target="_blank"
              rel="noreferrer"
            >
              timefold-quickstarts
            </a>
            <a
              className="underline underline-offset-2 hover:text-foreground"
              href="https://docs.timefold.ai/timefold-solver/latest/"
              target="_blank"
              rel="noreferrer"
            >
              Solver docs
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}

/** Standard page heading. */
export function PageHeader({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-3xl">
        {eyebrow ? (
          <div className="mb-1 text-[11px] font-medium uppercase tracking-widest text-primary">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {lead ? <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{lead}</p> : null}
      </div>
      {children ? <div className="flex items-center gap-2">{children}</div> : null}
    </div>
  );
}
