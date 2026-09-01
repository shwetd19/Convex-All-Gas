import { useAction, useQuery } from "convex/react";
import { useState } from "react";
import { Check, Copy, Inbox, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/format";

export function InboxBanner() {
  const inbox = useQuery(api.inbox.get);
  const provision = useAction(api.inbox.provision);
  const [provisioning, setProvisioning] = useState(false);
  const [copied, setCopied] = useState(false);

  if (inbox === undefined) return null;

  if (inbox !== null) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-emerald-500" /> Agent inbox
        </span>
        <Badge variant="secondary" className="font-mono">
          {inbox.email}
        </Badge>
        <Button
          variant="ghost"
          size="icon-xs"
          title="Copy address"
          onClick={() => {
            navigator.clipboard?.writeText(inbox.email).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check /> : <Copy />}
        </Button>
        <span className="hidden sm:inline">
          All outreach and replies flow through it, never your personal inbox.
        </span>
      </div>
    );
  }

  return (
    <Alert className="border-primary/30 bg-primary/5">
      <Inbox className="text-primary" />
      <AlertTitle>Set up the agent inbox</AlertTitle>
      <AlertDescription>
        One dedicated inbox sends all outreach. Set it up once.
      </AlertDescription>
      <AlertAction>
        <Button
          size="sm"
          disabled={provisioning}
          onClick={async () => {
            setProvisioning(true);
            try {
              await provision({});
              toast.success("Agent inbox created");
            } catch (err) {
              toast.error(errorMessage(err));
            } finally {
              setProvisioning(false);
            }
          }}
        >
          {provisioning && <Loader2 className="animate-spin" />}
          {provisioning ? "Creating…" : "Create inbox"}
        </Button>
      </AlertAction>
    </Alert>
  );
}
