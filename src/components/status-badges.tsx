import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CLASSIFICATION_LABEL, STATUS_LABEL, TYPE_LABEL } from "@/lib/types";
import type { LeadDoc, LeadType } from "@/lib/types";

const TYPE_DOT: Record<LeadType, string> = {
  customer: "bg-emerald-500",
  competitor: "bg-rose-500",
  complement: "bg-violet-500",
  office: "bg-sky-500",
  event: "bg-amber-500",
};

export const TYPE_TINT: Record<LeadType, string> = {
  customer: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  competitor: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  complement: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  office: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  event: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
};

export function TypeBadge({ type }: { type: LeadType }) {
  return (
    <Badge variant="outline" className="gap-1.5">
      <span className={cn("size-1.5 rounded-full", TYPE_DOT[type])} />
      {TYPE_LABEL[type]}
    </Badge>
  );
}

const STATUS_CLASS: Record<LeadDoc["status"], string> = {
  sourced: "border-border bg-background text-foreground",
  approved: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300",
  outreach_sent:
    "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300",
  replied:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  followed_up:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  cold: "border-transparent bg-muted text-muted-foreground",
  won: "border-transparent bg-emerald-600 text-white",
  skipped: "border-transparent bg-muted text-muted-foreground",
};

export function StatusBadge({ status }: { status: LeadDoc["status"] }) {
  return (
    <Badge variant="outline" className={STATUS_CLASS[status]}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

const CLASS_CLASS: Record<string, string> = {
  interested:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  not_interested:
    "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300",
  needs_info:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
};

export function ClassificationBadge({ classification }: { classification: string }) {
  return (
    <Badge variant="outline" className={CLASS_CLASS[classification] ?? ""}>
      {CLASSIFICATION_LABEL[classification] ?? classification}
    </Badge>
  );
}
