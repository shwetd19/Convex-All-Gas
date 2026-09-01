import { PenLine } from "lucide-react";
import type { ReactNode } from "react";

export function DraftsBanner({ count, action }: { count: number; action: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-amber-100/60 p-4 dark:border-amber-900 dark:from-amber-950 dark:to-amber-950/60">
      <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 to-amber-500 text-amber-950 shadow-sm shadow-amber-500/30">
        <PenLine className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-heading text-base font-semibold text-amber-950 dark:text-amber-100">
          {count} outreach draft{count === 1 ? "" : "s"} awaiting your approval
        </div>
        <div className="text-sm text-amber-800 dark:text-amber-300">
          Agent drafted personalized emails for new high-score leads.
        </div>
      </div>
      <div className="flex items-center gap-2">{action}</div>
    </div>
  );
}
