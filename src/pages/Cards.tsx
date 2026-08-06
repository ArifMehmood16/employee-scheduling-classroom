import { useMemo, useState } from "react";
import { Check, RotateCcw, Sparkles, X } from "lucide-react";
import { PageHeader } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatTile } from "@/components/ScoreDisplay";
import { cn } from "@/lib/utils";
import { DECK_META, FLASHCARDS, QUIZ, type Deck, type Flashcard } from "@/content/cards";

export default function Cards() {
  return (
    <>
      <PageHeader
        eyebrow="Recall practice"
        title="Cards and quiz"
        lead="Recognition is not recall. If you can follow an explanation but cannot reproduce it cold, you have not learnt it yet — these are here to find that gap before it matters."
      />
      <Tabs defaultValue="cards">
        <TabsList>
          <TabsTrigger value="cards">Flashcards</TabsTrigger>
          <TabsTrigger value="quiz">Quiz</TabsTrigger>
        </TabsList>
        <TabsContent value="cards">
          <FlashcardMode />
        </TabsContent>
        <TabsContent value="quiz">
          <QuizMode />
        </TabsContent>
      </Tabs>
    </>
  );
}

// ===========================================================================
// Flashcards — three-box Leitner
// ===========================================================================

type Box = 1 | 2 | 3;

function FlashcardMode() {
  const [decks, setDecks] = useState<Set<Deck>>(
    () => new Set(Object.keys(DECK_META) as Deck[]),
  );
  const [boxes, setBoxes] = useState<Record<string, Box>>({});
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const pool = useMemo(() => {
    const selected = FLASHCARDS.filter((card) => decks.has(card.deck));
    // Box 1 (not yet known) first, then 2, then 3 — a cheap Leitner rotation.
    return [...selected].sort((a, b) => (boxes[a.id] ?? 1) - (boxes[b.id] ?? 1));
  }, [decks, boxes]);

  const card = pool[index % Math.max(1, pool.length)];

  const grade = (box: Box) => {
    if (!card) return;
    setBoxes((previous) => ({ ...previous, [card.id]: box }));
    setRevealed(false);
    setIndex((previous) => previous + 1);
  };

  const counts = useMemo(() => {
    const result = { 1: 0, 2: 0, 3: 0 };
    for (const item of pool) result[boxes[item.id] ?? 1] += 1;
    return result;
  }, [pool, boxes]);

  const mastered = counts[3];
  const percent = pool.length ? (mastered / pool.length) * 100 : 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="space-y-4">
        {card ? (
          <Card className="min-h-[360px]">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="secondary">{DECK_META[card.deck].label}</Badge>
                <span className="font-mono text-[11px] text-muted-foreground tabular">
                  box {boxes[card.id] ?? 1} of 3
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <p className="text-lg font-medium leading-snug">{card.front}</p>

              {revealed ? (
                <div className="space-y-3">
                  <Separator />
                  <p className="text-sm leading-relaxed text-muted-foreground">{card.back}</p>
                  {card.trap ? (
                    <div
                      className="rounded-md border-l-2 bg-background/50 p-3"
                      style={{ borderColor: "var(--status-critical)" }}
                    >
                      <div
                        className="mb-1 text-[11px] font-medium uppercase tracking-wide"
                        style={{ color: "var(--status-critical)" }}
                      >
                        The usual mistake
                      </div>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {card.trap}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs italic text-muted-foreground">
                  Answer it out loud before you reveal. Reading the answer and thinking
                  &ldquo;yes, of course&rdquo; is the trap this whole page exists to catch.
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              No decks selected.
            </CardContent>
          </Card>
        )}

        {card ? (
          <div className="flex flex-wrap gap-2">
            {!revealed ? (
              <Button className="flex-1" onClick={() => setRevealed(true)}>
                Reveal
              </Button>
            ) : (
              <>
                <Button variant="outline" className="flex-1" onClick={() => grade(1)}>
                  <X /> Again
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => grade(2)}>
                  Almost
                </Button>
                <Button className="flex-1" onClick={() => grade(3)}>
                  <Check /> Got it
                </Button>
              </>
            )}
          </div>
        ) : null}
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Progress</CardTitle>
            <CardDescription>
              {mastered} of {pool.length} in box 3
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={percent} />
            <div className="grid grid-cols-3 gap-2">
              <StatTile label="Again" value={String(counts[1])} />
              <StatTile label="Almost" value={String(counts[2])} />
              <StatTile label="Got it" value={String(counts[3])} accent="var(--status-good)" />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                setBoxes({});
                setIndex(0);
                setRevealed(false);
              }}
            >
              <RotateCcw /> Reset progress
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Decks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {(Object.entries(DECK_META) as Array<[Deck, { label: string; blurb: string }]>).map(
              ([deck, meta]) => {
                const active = decks.has(deck);
                const total = FLASHCARDS.filter((c) => c.deck === deck).length;
                return (
                  <button
                    key={deck}
                    type="button"
                    onClick={() => {
                      setDecks((previous) => {
                        const next = new Set(previous);
                        if (next.has(deck)) next.delete(deck);
                        else next.add(deck);
                        return next;
                      });
                      setIndex(0);
                      setRevealed(false);
                    }}
                    className={cn(
                      "w-full rounded-md px-2 py-1.5 text-left transition-colors",
                      active ? "bg-secondary" : "opacity-50 hover:bg-secondary/50",
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-medium">{meta.label}</span>
                      <span className="font-mono text-[10px] text-muted-foreground tabular">
                        {total}
                      </span>
                    </div>
                    <div className="truncate text-[10px] text-muted-foreground">{meta.blurb}</div>
                  </button>
                );
              },
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ===========================================================================
// Quiz
// ===========================================================================

function QuizMode() {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);

  const score = useMemo(
    () => QUIZ.filter((question) => answers[question.id] === question.answer).length,
    [answers],
  );
  const answeredCount = Object.keys(answers).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
          <div>
            <div className="text-sm font-medium">
              {submitted ? `${score} of ${QUIZ.length} correct` : `${answeredCount} of ${QUIZ.length} answered`}
            </div>
            <div className="text-xs text-muted-foreground">
              {submitted
                ? score === QUIZ.length
                  ? "All correct. Read the explanations anyway — several contain a detail the question did not test."
                  : "Read the explanation on anything you missed, then find the relevant page and go back to the source."
                : "Ten questions. Several have a plausible distractor that is a real belief people hold."}
            </div>
          </div>
          <div className="flex gap-2">
            {submitted ? (
              <Button
                variant="outline"
                onClick={() => {
                  setAnswers({});
                  setSubmitted(false);
                }}
              >
                <RotateCcw /> Retake
              </Button>
            ) : (
              <Button onClick={() => setSubmitted(true)} disabled={answeredCount === 0}>
                <Sparkles /> Check answers
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {QUIZ.map((question, questionIndex) => {
        const chosen = answers[question.id];
        return (
          <Card key={question.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 font-mono text-xs text-muted-foreground tabular">
                  {String(questionIndex + 1).padStart(2, "0")}
                </span>
                <CardTitle className="text-[15px] font-medium leading-snug">
                  {question.question}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {question.options.map((option, optionIndex) => {
                const isChosen = chosen === optionIndex;
                const isCorrect = optionIndex === question.answer;
                const showState = submitted && (isChosen || isCorrect);
                return (
                  <button
                    key={optionIndex}
                    type="button"
                    disabled={submitted}
                    onClick={() =>
                      setAnswers((previous) => ({ ...previous, [question.id]: optionIndex }))
                    }
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-md border p-2.5 text-left text-sm transition-colors",
                      !submitted && "hover:bg-secondary/60",
                      isChosen && !submitted && "border-primary bg-primary/10",
                    )}
                    style={
                      showState
                        ? {
                            borderColor: isCorrect
                              ? "color-mix(in srgb, var(--status-good) 50%, transparent)"
                              : "color-mix(in srgb, var(--status-critical) 50%, transparent)",
                            background: isCorrect
                              ? "color-mix(in srgb, var(--status-good) 9%, transparent)"
                              : "color-mix(in srgb, var(--status-critical) 9%, transparent)",
                          }
                        : undefined
                    }
                  >
                    <span className="mt-0.5 shrink-0">
                      {submitted && isCorrect ? (
                        <Check className="h-4 w-4" style={{ color: "var(--status-good)" }} />
                      ) : submitted && isChosen ? (
                        <X className="h-4 w-4" style={{ color: "var(--status-critical)" }} />
                      ) : (
                        <span
                          className={cn(
                            "inline-block h-4 w-4 rounded-full border",
                            isChosen && "border-primary bg-primary",
                          )}
                        />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 leading-snug">{option}</span>
                  </button>
                );
              })}

              {submitted ? (
                <div className="mt-3 rounded-md border-l-2 border-primary bg-background/50 p-3">
                  <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-primary">
                    Why
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {question.explanation}
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
