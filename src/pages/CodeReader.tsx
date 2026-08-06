import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Highlight, themes } from "prism-react-renderer";
import { AlertTriangle, FileCode2, Target } from "lucide-react";
import { PageHeader } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { JAVA_SOURCES } from "@/content/javaSources";
import { ANNOTATED_FILES, type Annotation } from "@/content/annotations";

/**
 * Real Java, real line numbers, annotations anchored to line ranges.
 *
 * Reading a paraphrase of code teaches you the paraphrase. So the source here is the
 * verbatim contents of the files in the repo, and the annotations point at line numbers
 * you can go and check.
 */

const KIND_STYLE: Record<Annotation["kind"], { label: string; color: string }> = {
  annotation: { label: "note", color: "var(--series-1)" },
  variable: { label: "planning variable", color: "var(--status-serious)" },
  solution: { label: "solution", color: "var(--series-3)" },
  entity: { label: "entity", color: "var(--series-3)" },
  constraint: { label: "constraint", color: "var(--series-2)" },
  rest: { label: "rest rule", color: "var(--series-2)" },
  gotcha: { label: "gotcha", color: "var(--status-critical)" },
};

export default function CodeReader() {
  const [searchParams, setSearchParams] = useSearchParams();
  const fileKey = searchParams.get("file") ?? ANNOTATED_FILES[0].key;
  const file = ANNOTATED_FILES.find((f) => f.key === fileKey) ?? ANNOTATED_FILES[0];
  const source = JAVA_SOURCES[file.key] ?? "";

  const [activeIndex, setActiveIndex] = useState(0);
  const codeScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => setActiveIndex(0), [file.key]);

  const active = file.annotations[activeIndex];

  const lineToAnnotations = useMemo(() => {
    const map = new Map<number, number[]>();
    file.annotations.forEach((annotation, index) => {
      for (let line = annotation.lines[0]; line <= annotation.lines[1]; line++) {
        const list = map.get(line);
        if (list) list.push(index);
        else map.set(line, [index]);
      }
    });
    return map;
  }, [file.annotations]);

  const scrollToLine = (line: number) => {
    const container = codeScrollRef.current;
    if (!container) return;
    const target = container.querySelector<HTMLElement>(`[data-line="${line}"]`);
    if (target)
      container.scrollTo({
        top: Math.max(0, target.offsetTop - container.clientHeight / 3),
        behavior: "smooth",
      });
  };

  const selectAnnotation = (index: number) => {
    setActiveIndex(index);
    scrollToLine(file.annotations[index].lines[0]);
  };

  const gotchaCount = file.annotations.filter((a) => a.kind === "gotcha").length;

  return (
    <>
      <PageHeader
        eyebrow="Annotated source"
        title="The actual Java, with the reasoning attached"
        lead="Verbatim from use-cases/employee-scheduling in your checkout — line numbers match the files on disk. Click a highlighted line or an annotation to pair them up."
      />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {ANNOTATED_FILES.map((candidate) => {
          const isActive = candidate.key === file.key;
          const gotchas = candidate.annotations.filter((a) => a.kind === "gotcha").length;
          return (
            <Button
              key={candidate.key}
              size="sm"
              variant={isActive ? "default" : "outline"}
              onClick={() => setSearchParams({ file: candidate.key })}
            >
              <FileCode2 />
              {candidate.title}
              {gotchas > 0 ? (
                <span
                  className="ml-0.5 rounded px-1 text-[10px] font-semibold"
                  style={{
                    background: isActive
                      ? "rgba(255,255,255,0.2)"
                      : "color-mix(in srgb, var(--status-critical) 20%, transparent)",
                    color: isActive ? "inherit" : "var(--status-critical)",
                  }}
                >
                  {gotchas}
                </span>
              ) : null}
            </Button>
          );
        })}
      </div>

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-start gap-x-6 gap-y-2 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 shrink-0 text-primary" />
              <span className="text-xs font-medium uppercase tracking-wide text-primary">
                Read this file for
              </span>
            </div>
            <p className="mt-1 text-sm leading-relaxed">{file.readingGoal}</p>
            <p className="mt-1.5 text-xs text-muted-foreground">{file.blurb}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Badge variant="secondary">{source.split("\n").length} lines</Badge>
            <Badge variant="secondary">{file.annotations.length} notes</Badge>
            {gotchaCount > 0 ? <Badge variant="hard">{gotchaCount} gotchas</Badge> : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
        {/* -------- Code -------- */}
        <Card className="overflow-hidden">
          <CardHeader className="border-b py-2.5">
            <CardDescription className="font-mono text-[11px]">{file.path}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div ref={codeScrollRef} className="max-h-[720px] overflow-auto">
              <Highlight theme={themes.vsDark} code={source} language="java">
                {({ tokens, getLineProps, getTokenProps }) => (
                  <pre className="!m-0 !bg-transparent p-0 text-[12px] leading-[1.55]">
                    {tokens.map((line, index) => {
                      const lineNumber = index + 1;
                      const annotationIndexes = lineToAnnotations.get(lineNumber);
                      const isActive =
                        active &&
                        lineNumber >= active.lines[0] &&
                        lineNumber <= active.lines[1];
                      const kind = annotationIndexes
                        ? file.annotations[annotationIndexes[0]].kind
                        : null;
                      return (
                        <div
                          key={index}
                          {...getLineProps({ line })}
                          data-line={lineNumber}
                          onClick={() => {
                            if (annotationIndexes) selectAnnotation(annotationIndexes[0]);
                          }}
                          className={cn(
                            "flex px-0 transition-colors",
                            annotationIndexes && "cursor-pointer hover:bg-primary/10",
                            isActive && "bg-primary/15",
                          )}
                          style={
                            annotationIndexes && kind
                              ? { boxShadow: `inset 3px 0 0 ${KIND_STYLE[kind].color}` }
                              : undefined
                          }
                        >
                          <span className="w-11 shrink-0 select-none pr-3 text-right font-mono text-[10px] tabular text-muted-foreground/60">
                            {lineNumber}
                          </span>
                          <span className="min-w-0 flex-1 whitespace-pre pr-4">
                            {line.map((token, key) => (
                              <span key={key} {...getTokenProps({ token })} />
                            ))}
                          </span>
                        </div>
                      );
                    })}
                  </pre>
                )}
              </Highlight>
            </div>
          </CardContent>
        </Card>

        {/* -------- Annotations -------- */}
        <div className="space-y-3">
          {active ? (
            <Card style={{ borderLeftWidth: 3, borderLeftColor: KIND_STYLE[active.kind].color }}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  {active.kind === "gotcha" ? (
                    <AlertTriangle
                      className="h-4 w-4 shrink-0"
                      style={{ color: KIND_STYLE.gotcha.color }}
                    />
                  ) : null}
                  <Badge
                    variant="outline"
                    style={{ color: KIND_STYLE[active.kind].color, borderColor: "currentColor" }}
                  >
                    {KIND_STYLE[active.kind].label}
                  </Badge>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    line{active.lines[0] === active.lines[1] ? "" : "s"} {active.lines[0]}
                    {active.lines[0] === active.lines[1] ? "" : `–${active.lines[1]}`}
                  </span>
                </div>
                <CardTitle className="pt-1 text-[15px] leading-snug">{active.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm leading-relaxed text-muted-foreground">{active.body}</p>
                {active.ifRemoved ? (
                  <div
                    className="rounded-md border-l-2 bg-background/50 p-3"
                    style={{ borderColor: "var(--status-serious)" }}
                  >
                    <div
                      className="mb-1 text-[11px] font-medium uppercase tracking-wide"
                      style={{ color: "var(--status-serious)" }}
                    >
                      If you remove it
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {active.ifRemoved}
                    </p>
                  </div>
                ) : null}
                <div className="flex justify-between pt-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={activeIndex === 0}
                    onClick={() => selectAnnotation(activeIndex - 1)}
                  >
                    ← Previous
                  </Button>
                  <span className="self-center text-xs text-muted-foreground tabular">
                    {activeIndex + 1} / {file.annotations.length}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={activeIndex === file.annotations.length - 1}
                    onClick={() => selectAnnotation(activeIndex + 1)}
                  >
                    Next →
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">All notes</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[340px] pr-3">
                <div className="space-y-1">
                  {file.annotations.map((annotation, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => selectAnnotation(index)}
                      className={cn(
                        "w-full rounded-md px-2 py-1.5 text-left transition-colors",
                        index === activeIndex ? "bg-secondary" : "hover:bg-secondary/50",
                      )}
                      style={{
                        boxShadow: `inset 2px 0 0 ${KIND_STYLE[annotation.kind].color}`,
                      }}
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="shrink-0 font-mono text-[10px] tabular text-muted-foreground">
                          {annotation.lines[0]}
                        </span>
                        <span className="min-w-0 flex-1 text-xs leading-snug">
                          {annotation.title}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
