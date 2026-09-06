import type { LeadDoc, LeadRow } from "@/lib/types";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";

// Pipeline stages (kanban columns) derived from the lead status lifecycle.
const STAGES: { key: string; label: string; statuses: LeadDoc["status"][]; tint: string }[] = [
  { key: "new", label: "New", statuses: ["sourced", "approved"], tint: "bg-slate-400" },
  { key: "contacted", label: "Contacted", statuses: ["outreach_sent", "followed_up"], tint: "bg-blue-500" },
  { key: "replied", label: "Replied", statuses: ["replied"], tint: "bg-emerald-500" },
  { key: "won", label: "Won", statuses: ["won"], tint: "bg-emerald-600" },
  { key: "cold", label: "Cold", statuses: ["cold"], tint: "bg-slate-300" },
];

function BoardCard({ row, onOpen }: { row: LeadRow; onOpen: () => void }) {
  const { lead } = row;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-xl border bg-card p-3 text-left shadow-sm transition-colors hover:border-blue-300"
    >
      <div className="flex items-center gap-2">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[0.6rem] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-200">
          {initials(lead.name)}
        </div>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{lead.name}</span>
        {lead.score !== undefined && (
          <span className="shrink-0 text-xs font-bold text-blue-700 tabular-nums dark:text-blue-300">
            {Math.round(lead.score)}
          </span>
        )}
      </div>
      {lead.relevanceNote && (
        <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{lead.relevanceNote}</p>
      )}
    </button>
  );
}

export function LeadBoard({ rows, onOpen }: { rows: LeadRow[]; onOpen: (id: string) => void }) {
  const live = rows.filter((r) => r.lead.status !== "skipped");
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {STAGES.map((stage) => {
        const inStage = live
          .filter((r) => stage.statuses.includes(r.lead.status))
          .sort((a, b) => (b.lead.score ?? 0) - (a.lead.score ?? 0));
        return (
          <div key={stage.key} className="flex min-w-0 flex-col rounded-2xl bg-muted/40 p-2.5">
            <div className="mb-2 flex items-center gap-2 px-1">
              <span className={cn("size-2 rounded-full", stage.tint)} />
              <span className="text-sm font-semibold">{stage.label}</span>
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">{inStage.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {inStage.length === 0 ? (
                <div className="rounded-xl border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                  Empty
                </div>
              ) : (
                inStage.map((r) => <BoardCard key={r.lead._id} row={r} onOpen={() => onOpen(r.lead._id)} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
