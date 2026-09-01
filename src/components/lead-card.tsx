import { useMutation } from "convex/react";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import { ClassificationBadge, StatusBadge } from "@/components/status-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { errorMessage, formatCountdown, initials } from "@/lib/format";
import { isDraftReady } from "@/lib/types";
import type { LeadRow } from "@/lib/types";
import { cn } from "@/lib/utils";

export function LeadCard({
  row,
  now,
  onOpen,
  compact = false,
}: {
  row: LeadRow;
  now: number;
  onOpen: () => void;
  compact?: boolean;
}) {
  const { lead, outreach } = row;
  const approve = useMutation(api.leads.approve);
  const [busy, setBusy] = useState(false);

  const draftReady = isDraftReady(row);
  const sent = outreach?.sentAt !== undefined;
  const dim = lead.status === "skipped" || lead.status === "cold";
  const followUpDue =
    sent &&
    outreach?.nextActionAt !== undefined &&
    outreach.followUpSentAt === undefined &&
    outreach.lastReplyAt === undefined;

  const snippet = draftReady ? (outreach?.draftText ?? "").split("\n").find((l) => l.trim()) : null;

  const meta = [
    lead.contactEmail ?? "no contact email found",
    lead.source ? `via ${lead.source}` : null,
    lead.address && !compact ? lead.address : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li
      className={cn(
        "group min-w-0 rounded-2xl bg-card p-4 text-sm shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.12)] ring-1 ring-slate-200/80 transition-all hover:ring-blue-300 dark:ring-white/10",
        draftReady && "bg-blue-50/40 ring-blue-300 dark:bg-blue-950/20 dark:ring-blue-800",
        dim && "opacity-60",
      )}
    >
      <div className="flex items-start gap-4">
        <div
          role="button"
          tabIndex={0}
          onClick={onOpen}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onOpen();
            }
          }}
          className="flex min-w-0 flex-1 cursor-pointer items-start gap-4"
        >
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-slate-50 to-slate-100 font-heading text-base font-bold text-slate-600 ring-1 ring-slate-200 dark:from-slate-800 dark:to-slate-900 dark:text-slate-200 dark:ring-white/10">
            {initials(lead.name)}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-heading text-base font-semibold">{lead.name}</span>
              {draftReady ? (
                <Badge className="border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
                  Draft ready
                </Badge>
              ) : (
                <StatusBadge status={lead.status} />
              )}
              {outreach?.replyClassification && (
                <ClassificationBadge classification={outreach.replyClassification} />
              )}
              {followUpDue && outreach?.nextActionAt !== undefined && (
                <Badge variant="outline" className="text-muted-foreground">
                  follow-up in {formatCountdown(outreach.nextActionAt - now)}
                </Badge>
              )}
            </div>
            {lead.relevanceNote && (
              <p className="line-clamp-1 text-muted-foreground">{lead.relevanceNote}</p>
            )}
            <p className="line-clamp-1 text-xs break-all text-muted-foreground">{meta}</p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {lead.score !== undefined && (
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 tabular-nums dark:bg-blue-950 dark:text-blue-300">
              {Math.round(lead.score)}
            </span>
          )}
          {!compact && (
            <div className="flex items-center gap-2">
              {draftReady ? (
                <>
                  <Button variant="outline" size="sm" onClick={onOpen}>
                    Review
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await approve({ leadId: lead._id });
                        toast.success("Outreach approved");
                      } catch (err) {
                        toast.error(errorMessage(err));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {busy && <Loader2 className="animate-spin" />}
                    {busy ? "Sending…" : "Approve & send"}
                  </Button>
                </>
              ) : lead.status === "sourced" && outreach?.draftStatus === "generating" ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> drafting…
                </span>
              ) : (
                <Button variant="outline" size="sm" onClick={onOpen}>
                  {sent ? "View thread" : "Details"}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {snippet && (
        <div className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700 italic dark:bg-white/5 dark:text-slate-300">
          “{snippet.length > 160 ? `${snippet.slice(0, 160)}…` : snippet}”
        </div>
      )}
    </li>
  );
}
