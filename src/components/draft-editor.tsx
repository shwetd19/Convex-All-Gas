import { useMutation } from "convex/react";
import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/format";
import type { LeadDoc, OutreachDoc } from "@/lib/types";

export function DraftEditor({ lead, outreach }: { lead: LeadDoc; outreach: OutreachDoc }) {
  const updateDraft = useMutation(api.outreach.updateDraft);
  const approve = useMutation(api.leads.approve);
  const [subject, setSubject] = useState(outreach.subject ?? "");
  const [body, setBody] = useState(outreach.draftText ?? "");
  const [busy, setBusy] = useState(false);

  const dirty = subject !== (outreach.subject ?? "") || body !== (outreach.draftText ?? "");

  const run = async (fn: () => Promise<unknown>, okMessage: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(okMessage);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-4 dark:border-blue-900 dark:bg-blue-950/20">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[0.7rem] font-medium tracking-[0.18em] text-muted-foreground uppercase">
          Drafted outreach · review before it sends
        </div>
        <span className="text-xs text-muted-foreground">To: {lead.contactEmail ?? "no contact found"}</span>
      </div>
      <div className="space-y-2">
        <Label htmlFor="draft-subject">Subject</Label>
        <Input
          id="draft-subject"
          className="rounded-xl bg-background"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="draft-body">Email body</Label>
        <Textarea
          id="draft-body"
          className="rounded-xl bg-background leading-relaxed"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={9}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={busy || !lead.contactEmail}
          onClick={() =>
            void run(async () => {
              if (dirty) await updateDraft({ leadId: lead._id, subject, draftText: body });
              await approve({ leadId: lead._id });
            }, "Outreach approved")
          }
        >
          {busy ? <Loader2 className="animate-spin" /> : <Send />}
          {busy ? "Sending…" : "Approve & send"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !dirty}
          onClick={() =>
            void run(
              () => updateDraft({ leadId: lead._id, subject, draftText: body }),
              "Draft saved",
            )
          }
        >
          Save changes
        </Button>
      </div>
    </div>
  );
}
