import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/tutorials")({
  head: () => ({
    meta: [
      { title: "Tutorials — Timefold Learn" },
      {
        name: "description",
        content: "Step-by-step tutorials for building optimization apps with Timefold.",
      },
      { property: "og:title", content: "Tutorials — Timefold Learn" },
      {
        property: "og:description",
        content: "Step-by-step tutorials for building optimization apps with Timefold.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TutorialsPage,
});

function TutorialsPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Tutorials</h1>
      <p className="mt-2 text-muted-foreground">
        Follow guided lessons to understand Timefold concepts from scratch.
      </p>

      <div className="mt-8 space-y-3">
        {[
          { title: "1. Introduction to constraint solving", status: "Not started" },
          { title: "2. Modeling your domain", status: "Not started" },
          { title: "3. Writing constraints", status: "Not started" },
          { title: "4. Running the solver", status: "Not started" },
        ].map((tutorial) => (
          <div
            key={tutorial.title}
            className="flex items-center justify-between rounded-lg border bg-card p-4 text-card-foreground"
          >
            <span className="font-medium">{tutorial.title}</span>
            <span className="text-xs text-muted-foreground">{tutorial.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
