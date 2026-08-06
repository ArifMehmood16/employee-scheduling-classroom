import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/playground")({
  head: () => ({
    meta: [
      { title: "Playground — Timefold Learn" },
      {
        name: "description",
        content: "Experiment with Timefold models in an interactive playground.",
      },
      { property: "og:title", content: "Playground — Timefold Learn" },
      {
        property: "og:description",
        content: "Experiment with Timefold models in an interactive playground.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlaygroundPage,
});

function PlaygroundPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Playground</h1>
      <p className="mt-2 text-muted-foreground">
        Edit a model, run the solver, and inspect the solution.
      </p>

      <div className="mt-8 grid h-[calc(100vh-12rem)] gap-4 lg:grid-cols-2">
        <div className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-medium text-muted-foreground">Model editor</h2>
          <div className="mt-4 h-full rounded-md bg-muted/50 p-4 font-mono text-sm text-muted-foreground">
            // Your model code goes here
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-medium text-muted-foreground">Solution output</h2>
          <div className="mt-4 h-full rounded-md bg-muted/50 p-4 font-mono text-sm text-muted-foreground">
            // Solver output will appear here
          </div>
        </div>
      </div>
    </div>
  );
}
