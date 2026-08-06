import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, CheckCircle2, Circle, Clock, HelpCircle } from "lucide-react";
import { PageHeader } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { LESSONS, MODULES } from "@/content/lessons";

export default function Classroom() {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string>(LESSONS[0].id);

  const totalMinutes = LESSONS.reduce((sum, lesson) => sum + lesson.minutes, 0);
  const doneMinutes = LESSONS.filter((lesson) => done.has(lesson.id)).reduce(
    (sum, lesson) => sum + lesson.minutes,
    0,
  );
  const percent = (done.size / LESSONS.length) * 100;

  const toggle = (id: string) => {
    setDone((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <>
      <PageHeader
        eyebrow="Classroom"
        title="A route through the material"
        lead="Ten lessons, roughly two hours if you actually do the exercises. Each one ends with a checkpoint question — if you cannot answer it, the lesson has not landed yet and the next one will be harder than it needs to be."
      />

      <Card className="mb-5">
        <CardContent className="flex flex-wrap items-center gap-6 py-4">
          <div className="min-w-[200px] flex-1">
            <div className="mb-1.5 flex justify-between text-xs">
              <span className="font-medium">
                {done.size} of {LESSONS.length} lessons
              </span>
              <span className="text-muted-foreground tabular">
                {doneMinutes} / {totalMinutes} min
              </span>
            </div>
            <Progress value={percent} />
          </div>
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/map">Start at the mindmap</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/cards">Test yourself</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        {MODULES.map((module) => (
          <div key={module}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">
              {module}
            </h2>
            <div className="space-y-2">
              {LESSONS.filter((lesson) => lesson.module === module).map((lesson) => {
                const isDone = done.has(lesson.id);
                const isOpen = openId === lesson.id;
                return (
                  <Card key={lesson.id} className={cn(isOpen && "ring-1 ring-primary/40")}>
                    <div className="flex items-start gap-3 p-4">
                      <button
                        type="button"
                        onClick={() => toggle(lesson.id)}
                        className="mt-0.5 shrink-0"
                        aria-label={isDone ? "Mark as not done" : "Mark as done"}
                      >
                        {isDone ? (
                          <CheckCircle2 className="h-5 w-5" style={{ color: "var(--status-good)" }} />
                        ) : (
                          <Circle className="h-5 w-5 text-muted-foreground/50" />
                        )}
                      </button>

                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => setOpenId(isOpen ? "" : lesson.id)}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "text-[15px] font-medium",
                              isDone && "text-muted-foreground line-through",
                            )}
                          >
                            {lesson.title}
                          </span>
                          <Badge variant="secondary" className="gap-1">
                            <Clock className="h-3 w-3" />
                            {lesson.minutes} min
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                          {lesson.thesis}
                        </p>
                      </button>
                    </div>

                    {isOpen ? (
                      <CardContent className="pt-0">
                        <Separator className="mb-4" />
                        <div className="grid gap-5 md:grid-cols-2">
                          <div>
                            <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                              You should be able to
                            </div>
                            <ul className="space-y-1.5">
                              {lesson.outcomes.map((outcome) => (
                                <li
                                  key={outcome}
                                  className="flex gap-2 text-sm leading-snug text-muted-foreground"
                                >
                                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                                  {outcome}
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div>
                            <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                              Do this
                            </div>
                            <ol className="space-y-2">
                              {lesson.steps.map((step, index) => (
                                <li key={index} className="text-sm leading-snug">
                                  <span className="mr-1.5 font-mono text-xs text-muted-foreground">
                                    {index + 1}.
                                  </span>
                                  <span className="text-muted-foreground">{step.text}</span>
                                  {step.route ? (
                                    <Button
                                      asChild
                                      size="sm"
                                      variant="link"
                                      className="h-auto p-0 pl-1.5 text-xs"
                                    >
                                      <Link to={step.route}>{step.routeLabel ?? "Open"} →</Link>
                                    </Button>
                                  ) : null}
                                </li>
                              ))}
                            </ol>
                          </div>
                        </div>

                        <div className="mt-5 rounded-md border-l-2 border-primary bg-background/50 p-3">
                          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-primary">
                            <HelpCircle className="h-3.5 w-3.5" />
                            Checkpoint
                          </div>
                          <p className="text-sm leading-relaxed">{lesson.checkpoint}</p>
                        </div>

                        {lesson.external?.length ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {lesson.external.map((link) => (
                              <Button key={link.url} asChild size="sm" variant="ghost">
                                <a href={link.url} target="_blank" rel="noreferrer">
                                  {link.label} <ArrowUpRight />
                                </a>
                              </Button>
                            ))}
                          </div>
                        ) : null}
                      </CardContent>
                    ) : null}
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
