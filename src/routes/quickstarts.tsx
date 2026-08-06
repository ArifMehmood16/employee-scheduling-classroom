import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/quickstarts")({
  head: () => ({
    meta: [
      { title: "Quickstarts — Timefold Learn" },
      { name: "description", content: "Browse Timefold quickstarts to learn optimization by example." },
      { property: "og:title", content: "Quickstarts — Timefold Learn" },
      { property: "og:description", content: "Browse Timefold quickstarts to learn optimization by example." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: QuickstartsPage,
});

function QuickstartsPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Quickstarts</h1>
      <p className="mt-2 text-muted-foreground">
        Start solving real planning problems with ready-to-run examples.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          "Vehicle routing",
          "Employee rostering",
          "Task assignment",
          "Maintenance scheduling",
          "School timetabling",
          "Order picking",
        ].map((title) => (
          <div
            key={title}
            className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm transition-colors hover:bg-accent/50"
          >
            <h2 className="font-medium">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Select a quickstart to load its code and walkthrough.</p>
          </div>
        ))}
      </div>
    </div>
  );
}
