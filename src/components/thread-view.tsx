import { ClassificationBadge } from "@/components/status-badges";
import { Badge } from "@/components/ui/badge";
import { formatWhen } from "@/lib/format";
import { KIND_LABEL } from "@/lib/types";
import type { MessageDoc } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ThreadView({
  messages,
  businessName,
  leadName,
}: {
  messages: MessageDoc[];
  businessName: string;
  leadName: string;
}) {
  return (
    <div className="space-y-3">
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Conversation
      </div>
      {messages.map((m) => (
        <div
          key={m._id}
          className={cn(
            "rounded-lg border p-3 text-sm",
            m.direction === "outbound" ? "bg-muted/40" : "bg-card",
          )}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium">
              {m.direction === "outbound" ? `${businessName} · agent` : leadName}
            </span>
            <Badge variant="outline">{KIND_LABEL[m.kind]}</Badge>
            {m.classification && <ClassificationBadge classification={m.classification} />}
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
              {formatWhen(m.sentAt)}
            </span>
          </div>
          {m.subject && <div className="mt-2 font-medium">{m.subject}</div>}
          <pre className="mt-2 font-sans whitespace-pre-wrap text-sm leading-relaxed">
            {m.text}
          </pre>
        </div>
      ))}
    </div>
  );
}
