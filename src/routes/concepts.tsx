import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/concepts")({
  head: () => ({
    meta: [
      { title: "Concepts — Timefold Learn" },
      { name: "description", content: "Core concepts for planning optimization with Timefold." },
      { property: "og:title", content: "Concepts — Timefold Learn" },
      {
        property: "og:description",
        content: "Core concepts for planning optimization with Timefold.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConceptsPage,
});

function ConceptsPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Concepts</h1>
      <p className="mt-2 text-muted-foreground">
        Learn the building blocks of constraint-based planning.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {[
          "Planning entities",
          "Planning variables",
          "Constraints",
          "Score calculation",
          "Solver phases",
        ].map((concept) => (
          <div key={concept} className="rounded-lg border bg-card p-4 text-card-foreground">
            <h2 className="font-medium">{concept}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Concept explanation placeholder.</p>
          </div>
        ))}
      </div>
    </div>
  );
}
