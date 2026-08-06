import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Timefold Learn" },
      { name: "description", content: "Configure your Timefold learning environment." },
      { property: "og:title", content: "Settings — Timefold Learn" },
      { property: "og:description", content: "Configure your Timefold learning environment." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-2 text-muted-foreground">Customize your learning environment preferences.</p>

      <div className="mt-8 max-w-md space-y-4">
        <div className="rounded-lg border bg-card p-4">
          <h2 className="font-medium">Appearance</h2>
          <p className="mt-1 text-sm text-muted-foreground">Theme and display options.</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <h2 className="font-medium">Notifications</h2>
          <p className="mt-1 text-sm text-muted-foreground">Tutorial progress and update alerts.</p>
        </div>
      </div>
    </div>
  );
}
