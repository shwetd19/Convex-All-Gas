import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { isDraftReady } from "@/lib/types";
import type { BusinessDoc, LeadRow } from "@/lib/types";

// Rough per-lead time the agent saves the owner (minutes): sourcing/research
// per lead, plus writing + sending per contacted lead.
const MIN_PER_SOURCED = 2;
const MIN_PER_CONTACTED = 6;

function pct(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="py-5">
        <div className="text-3xl font-bold tabular-nums">{value}</div>
        <div className="mt-1 text-sm font-medium">{label}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function RateBar({ label, value, tint }: { label: string; value: number; tint: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">{value}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", tint)} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
}

export function InsightsPage({ business, rows }: { business: BusinessDoc; rows: LeadRow[] }) {
  const live = rows.filter((r) => r.lead.status !== "skipped");
  const sourced = live.length;
  const contacted = rows.filter((r) => r.outreach?.sentAt !== undefined).length;
  const replied = rows.filter((r) => r.outreach?.lastReplyAt !== undefined).length;
  const interested = rows.filter((r) => r.outreach?.replyClassification === "interested").length;
  const won = rows.filter((r) => r.lead.status === "won").length;
  const draftsReady = rows.filter(isDraftReady).length;

  const minutesSaved = sourced * MIN_PER_SOURCED + contacted * MIN_PER_CONTACTED;
  const hoursSaved = (minutesSaved / 60).toFixed(1);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Insights"
        description={`How ${business.name ?? "your business"}'s agent is performing`}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Leads sourced" value={String(sourced)} />
        <StatCard label="Outreach sent" value={String(contacted)} />
        <StatCard label="Replies" value={String(replied)} sub={`${interested} interested`} />
        <StatCard label="Won" value={String(won)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Conversion</CardTitle>
          <CardDescription>Of the {contacted} lead{contacted === 1 ? "" : "s"} contacted so far.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RateBar label="Reply rate" value={pct(replied, contacted)} tint="bg-blue-500" />
          <RateBar label="Interested rate" value={pct(interested, contacted)} tint="bg-emerald-500" />
          <RateBar label="Win rate" value={pct(won, contacted)} tint="bg-violet-500" />
        </CardContent>
      </Card>

      <Card className="border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-6">
          <div>
            <div className="text-sm font-medium text-muted-foreground">Estimated time saved</div>
            <div className="text-3xl font-bold text-emerald-700 tabular-nums dark:text-emerald-400">
              ~{hoursSaved} hours
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Researching {sourced} leads and drafting {contacted} personalized emails, done by the agent.
            </div>
          </div>
          {draftsReady > 0 && (
            <div className="text-right">
              <div className="text-2xl font-bold tabular-nums">{draftsReady}</div>
              <div className="text-xs text-muted-foreground">drafts ready to review</div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
