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
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1500px] items-center gap-4 px-4">
          <Link to="/" className="flex shrink-0 items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold tracking-tight">
              Employee Scheduling
              <span className="ml-1.5 font-normal text-muted-foreground">Classroom</span>
            </span>
          </Link>

          <nav className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto lg:flex">
            {NAV.map((item) => {
              const active = location.pathname === item.to;
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1.5 text-[12.5px] font-medium transition-colors",
                    active
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                  )}
                >
                  {/* Icons only once there is room for them — below that the labels win. */}
                  <Icon className="hidden h-3.5 w-3.5 2xl:block" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Badge variant="secondary" className="hidden md:inline-flex">
              {dataset} · {schedule.shifts.length} shifts · {schedule.employees.length} staff
            </Badge>
            {!feasibility.feasible ? (
              <Badge variant="hard" className="hidden md:inline-flex">
                bound {feasibility.hardScoreUpperBound}hard
              </Badge>
            ) : null}
            {/* An unassigned schedule scores a misleading 0hard/0soft, so say so here
                rather than letting the pill imply a perfect solution. */}
            {explanation.unassignedCount > 0 ? (
              <Badge variant="soft" className="hidden sm:inline-flex">
                {explanation.unassignedCount} unassigned
              </Badge>
            ) : null}
            <ScorePill score={explanation.score} />
          </div>
        </div>

        {/* Mobile nav */}
        <nav className="flex gap-0.5 overflow-x-auto border-t px-3 py-1.5 lg:hidden">
          {NAV.map((item) => {
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium",
                  active ? "bg-secondary text-foreground" : "text-muted-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-[1500px] px-4 py-6">{children}</main>

      <footer className="mt-12 border-t px-4 py-6">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <span>
            A study tool for the Timefold employee-scheduling quickstart. The solver here
            is an independent TypeScript port, verified against hand-computed cases.
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
