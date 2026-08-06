import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/templates")({
  head: () => ({
    meta: [
      { title: "Templates — Timefold Learn" },
      {
        name: "description",
        content: "Starter templates for common Timefold optimization problems.",
      },
      { property: "og:title", content: "Templates — Timefold Learn" },
      {
        property: "og:description",
        content: "Starter templates for common Timefold optimization problems.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TemplatesPage,
});

function TemplatesPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
      <p className="mt-2 text-muted-foreground">Jump-start a project with a pre-built template.</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {["Spring Boot", "Quarkus", "Micronaut", "Plain Java", "Kotlin"].map((template) => (
          <div key={template} className="rounded-lg border bg-card p-4 text-card-foreground">
            <h2 className="font-medium">{template}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Template scaffold placeholder.</p>
          </div>
        ))}
      </div>
    </div>
  );
}
