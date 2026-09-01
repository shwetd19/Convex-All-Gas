import { useMutation } from "convex/react";
import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { InboxBanner } from "@/components/inbox-banner";
import { LeadCard } from "@/components/lead-card";
import { LeadDialog } from "@/components/lead-dialog";
import { PageHeader } from "@/components/page-header";
import { StatsStrip } from "@/components/stats-strip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DraftsBanner } from "@/components/drafts-banner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { SCAN_WINDOW_MS, errorMessage, formatClock, useNowTick } from "@/lib/format";
import { LEAD_NAV, isDraftReady } from "@/lib/types";
import type { BusinessDoc, LeadRow, LeadType } from "@/lib/types";

export function LeadsPage({
  business,
  rows,
  type,
  search,
}: {
  business: BusinessDoc;
  rows: LeadRow[];
  type: LeadType;
  search: string;
}) {
  const approveAll = useMutation(api.leads.approveAll);
  const [openLeadId, setOpenLeadId] = useState<Id<"leads"> | null>(null);
  const [approvingAll, setApprovingAll] = useState(false);
  const now = useNowTick(1000);

  const scanUntil = business.scanUntil;
  const scanning =
    (scanUntil !== undefined && now < scanUntil) ||
    (scanUntil === undefined && business.status === "sourcing");
  const scanJustDone = scanUntil !== undefined && now >= scanUntil && now - scanUntil < 120_000;
  const liveLeads = rows.filter((r) => r.lead.status !== "skipped").length;

  const readyDrafts = rows.filter(isDraftReady).length;
  const q = search.trim().toLowerCase();

  const pageRows = rows
    .filter((r) => r.lead.type === type)
    .filter(
      (r) =>
        !q ||
        `${r.lead.name} ${r.lead.relevanceNote ?? ""} ${r.lead.contactEmail ?? ""}`
          .toLowerCase()
          .includes(q),
    )
    .sort((a, b) => (b.lead.score ?? 0) - (a.lead.score ?? 0));

  const openRow = openLeadId ? (rows.find((r) => r.lead._id === openLeadId) ?? null) : null;
  const label = LEAD_NAV.find((t) => t.key === type)?.label ?? type;
  const scanPct =
    scanUntil !== undefined
      ? Math.min(100, Math.max(2, (1 - (scanUntil - now) / SCAN_WINDOW_MS) * 100))
      : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title={label}
        description={
          <>
            {business.name ?? business.url}
            {business.address ? ` · ${business.address}` : ""}
          </>
        }
      />

      <InboxBanner />

      {scanning && (
        <Alert className="border-sky-200 bg-sky-50 text-sky-900 *:data-[slot=alert-description]:text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-100 dark:*:data-[slot=alert-description]:text-sky-200">
          <Loader2 className="animate-spin" />
          <AlertTitle className="flex items-center justify-between gap-2">
            <span>Still checking your block</span>
            {scanUntil !== undefined && (
              <span className="font-mono text-xs font-normal tabular-nums opacity-80">
                {formatClock(scanUntil - now)} left
              </span>
            )}
          </AlertTitle>
          <AlertDescription>
            Leads keep appearing below as they're found and judged.
            {scanUntil !== undefined && <Progress value={scanPct} className="mt-2 bg-sky-200 *:data-[slot=progress-indicator]:bg-sky-600 dark:bg-sky-900" />}
          </AlertDescription>
        </Alert>
      )}

      {!scanning && scanJustDone && (
        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900 *:data-[slot=alert-description]:text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100 dark:*:data-[slot=alert-description]:text-emerald-200">
          <CheckCircle2 />
          <AlertTitle>Done checking</AlertTitle>
          <AlertDescription>
            {liveLeads} lead{liveLeads === 1 ? "" : "s"} on the board. New finds come from the
            weekly rescan, or rescan any time from Settings.
          </AlertDescription>
        </Alert>
      )}

      <StatsStrip rows={rows} now={now} />

      {readyDrafts > 0 && business.approvalMode === "approve_each" && (
        <DraftsBanner
          count={readyDrafts}
          action={
            <Button
              variant="brand"
              size="lg"
              disabled={approvingAll}
              onClick={async () => {
                setApprovingAll(true);
                try {
                  await approveAll({ businessId: business._id });
                  toast.success("All drafts approved");
                } catch (err) {
                  toast.error(errorMessage(err));
                } finally {
                  setApprovingAll(false);
                }
              }}
            >
              {approvingAll && <Loader2 className="animate-spin" />}
              {approvingAll ? "Sending…" : "Approve & send all"}
            </Button>
          }
        />
      )}

      {pageRows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {q
              ? "No leads match your search."
              : business.status === "sourcing"
                ? "Nothing judged in this category yet. Watch the Activity page."
                : "No leads in this category yet. Try a rescan from Settings."}
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {pageRows.map((row) => (
            <LeadCard
              key={row.lead._id}
              row={row}
              now={now}
              onOpen={() => setOpenLeadId(row.lead._id)}
            />
          ))}
        </ul>
      )}

      {openRow && (
        <LeadDialog
          row={openRow}
          businessName={business.name ?? "Your business"}
          now={now}
          onClose={() => setOpenLeadId(null)}
        />
      )}
    </div>
  );
}
