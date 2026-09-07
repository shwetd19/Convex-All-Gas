import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { ActivityTimeline } from "@/components/activity-timeline";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useNowTick } from "@/lib/format";

const ISSUE_RE = /\b(fail|failed|skipped?|held|bounced|unsubscrib|error|couldn't|can't|invalid|limit)\b/i;
const isIssue = (a: { kind: string; message: string }) =>
  a.kind === "error" || (a.kind === "system" && ISSUE_RE.test(a.message));

type Filter = "all" | "sends" | "replies" | "issues";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "sends", label: "Sends" },
  { key: "replies", label: "Replies" },
  { key: "issues", label: "Issues" },
];

function Stat({ label, value, alert }: { label: string; value: number; alert?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3.5 py-2.5",
        alert && value > 0
          ? "border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950"
          : "bg-card",
      )}
    >
      <div
        className={cn(
          "text-xl font-bold tabular-nums",
          alert && value > 0 && "text-rose-600 dark:text-rose-400",
        )}
      >
        {value}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export function ActivityPage({ businessId }: { businessId: Id<"businesses"> }) {
  const activity = useQuery(api.activity.list, { businessId });
  const health = useQuery(api.activity.health, { businessId });
  const now = useNowTick(30_000);
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = (activity ?? []).filter((a) => {
    if (filter === "all") return true;
    if (filter === "sends") return a.kind === "sent" || a.kind === "follow_up" || a.kind === "draft";
    if (filter === "replies") return a.kind === "reply";
    return isIssue(a);
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Activity" description="Live, append-only log of everything the agent does." />

      {/* Health summary (last 7 days) */}
      {health && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Leads sourced" value={health.sourced} />
          <Stat label="Sent" value={health.sent} />
          <Stat label="Replies" value={health.replies} />
          <Stat label="Follow-ups" value={health.followUps} />
          <Stat label="Issues" value={health.issues} alert />
        </div>
      )}
      {health && (
        <p className="text-xs text-muted-foreground">
          {health.issues > 0
            ? `${health.issues} issue${health.issues === 1 ? "" : "s"} in the last 7 days — filter to Issues to review.`
            : "No issues in the last 7 days. All systems normal."}
        </p>
      )}

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              filter === f.key
                ? "border-transparent bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {activity === undefined ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-3/4" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {filter === "all"
              ? "Nothing yet. Activity shows up here as the agent works."
              : `No ${filter} to show.`}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-2">
            <ActivityTimeline items={filtered} now={now} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
