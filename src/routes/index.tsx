import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Boxes, Code2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Timefold Learn — Dashboard" },
      {
        name: "description",
        content: "Get started with Timefold optimization quickstarts and tutorials.",
      },
      { property: "og:title", content: "Timefold Learn — Dashboard" },
      {
        property: "og:description",
        content: "Get started with Timefold optimization quickstarts and tutorials.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="space-y-6 p-6">
      <section className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Welcome to Timefold Learn</h1>
        <p className="max-w-2xl text-muted-foreground">
          A hands-on learning environment for Timefold optimization. Pick a quickstart, follow a
          tutorial, or experiment in the playground.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <Boxes className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Quickstarts</CardTitle>
            <CardDescription>Run ready-to-use optimization examples.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" asChild>
              <Link to="/quickstarts">
                Browse quickstarts <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <BookOpen className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Tutorials</CardTitle>
            <CardDescription>Step-by-step guided lessons.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" asChild>
              <Link to="/tutorials">
                Start learning <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <Code2 className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Playground</CardTitle>
            <CardDescription>Edit models and run the solver.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" asChild>
              <Link to="/playground">
                Open playground <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Concepts</CardTitle>
            <CardDescription>Understand the core ideas.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" asChild>
              <Link to="/concepts">
                Explore concepts <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-medium">Recent activity</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your progress and recently opened quickstarts will appear here.
        </p>
        <div className="mt-4 flex h-32 items-center justify-center rounded-md bg-muted/50 text-sm text-muted-foreground">
          No activity yet
        </div>
      </section>
    </div>
  );
}
