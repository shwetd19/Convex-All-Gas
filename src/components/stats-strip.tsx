import { TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatPct } from "@/lib/format";
import type { LeadRow } from "@/lib/types";
import { cn } from "@/lib/utils";

export function StatsStrip({ rows, now }: { rows: LeadRow[]; now: number }) {
  const weekAgo = now - 7 * 86_400_000;
  const live = rows.filter((r) => r.lead.status !== "skipped");
  const thisWeek = live.filter((r) => r.lead._creationTime >= weekAgo).length;
  const sent = rows.filter((r) => r.outreach?.sentAt !== undefined).length;
  const replies = rows.filter((r) => r.outreach?.lastReplyAt !== undefined).length;
  const won = rows.filter((r) => r.lead.status === "won").length;
  const interested = rows.filter((r) => r.outreach?.replyClassification === "interested").length;

  const stats: { label: string; value: string; sub: React.ReactNode; tone: string }[] = [
    {
      label: "Leads sourced",
      value: String(live.length),
      sub: (
        <span className="inline-flex items-center gap-1">
          <TrendingUp className="size-3.5" /> {thisWeek} this week
        </span>
      ),
      tone: "text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "Outreach sent",
      value: String(sent),
      sub: `${formatPct(sent, live.length)} of leads contacted`,
      tone: "text-blue-600 dark:text-blue-400",
    },
    {
      label: "Reply rate",
      value: formatPct(replies, sent),
      sub: `across ${sent} send${sent === 1 ? "" : "s"}`,
      tone: "text-muted-foreground",
    },
    {
      label: "Won",
      value: String(won),
      sub: `${interested} interested repl${interested === 1 ? "y" : "ies"}`,
      tone: "text-amber-600 dark:text-amber-400",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {stats.map((s) => (
        <Card key={s.label} size="sm" className="[--card-spacing:--spacing(4)]">
          <CardContent>
            <div className="text-[0.7rem] font-medium tracking-[0.18em] text-muted-foreground uppercase">
              {s.label}
            </div>
            <div className="mt-1.5 font-heading text-3xl font-bold tracking-tight tabular-nums">
              {s.value}
            </div>
            <div className={cn("mt-2 text-sm font-medium", s.tone)}>{s.sub}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
