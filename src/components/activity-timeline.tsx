import { formatAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ActivityItem = { _id: string; _creationTime: number; kind: string; message: string };

const KIND_DOT: Record<string, string> = {
  draft: "bg-blue-500",
  sent: "bg-blue-500",
  reply: "bg-emerald-500",
  follow_up: "bg-amber-500",
  error: "bg-rose-500",
  sourcing: "bg-slate-400",
  system: "bg-slate-400",
};

export function ActivityTimeline({
  items,
  now,
  className,
}: {
  items: ActivityItem[];
  now: number;
  className?: string;
}) {
  return (
    <ol className={cn("relative space-y-5 border-l-2 border-slate-100 pl-6 dark:border-white/10", className)}>
      {items.map((a) => (
        <li key={a._id} className="relative">
          <span
            className={cn(
              "absolute -left-[31px] top-1 size-4 rounded-full ring-4 ring-card",
              KIND_DOT[a.kind] ?? "bg-slate-400",
            )}
          />
          <div className={cn("text-sm font-semibold leading-snug", a.kind === "error" && "text-rose-600")}>
            {a.message}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {formatAgo(a._creationTime, now)} · {a.kind.replace("_", " ")}
          </div>
        </li>
      ))}
    </ol>
  );
}
