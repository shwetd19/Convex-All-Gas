import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

// Shown on every page of the shared, read-only demo workspace so the user
// always knows this is a sample, not their own business.
export function DemoBanner({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-sky-50 px-4 py-3.5 dark:border-violet-900/60 dark:from-violet-950/40 dark:to-sky-950/30">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 text-white shadow-sm">
        <Sparkles className="size-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">
          Demo workspace — Convex, mapped by Block
        </div>
        <div className="text-xs text-muted-foreground">
          A sample so you can explore the leads, drafts, and a real reply thread. It's read-only —
          add your own business to run real outreach.
        </div>
      </div>
      <Button size="sm" variant="brand" className="shrink-0" onClick={onAdd}>
        Add your business
      </Button>
    </div>
  );
}
