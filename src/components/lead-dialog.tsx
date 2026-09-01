import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { AlertCircle, ExternalLink, Loader2, MapPin, Send, Trophy } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import { DraftEditor } from "@/components/draft-editor";
import { ClassificationBadge, StatusBadge, TypeBadge } from "@/components/status-badges";
import { ThreadView } from "@/components/thread-view";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cleanEvidence, errorMessage, formatCountdown, formatWhen, initials } from "@/lib/format";
import type { LeadRow, MessageDoc, OutreachDoc } from "@/lib/types";

export type LeadDetail = { outreach: OutreachDoc | null; messages: MessageDoc[] } | null | undefined;

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[0.7rem] font-medium tracking-[0.18em] text-muted-foreground uppercase">
      {children}
    </div>
  );
}

export function LeadDialogView({
  row,
  data,
  businessName,
  now,
  onClose,
  onFollowUpNow,
  onReply,
  onMarkWon,
  onSkip,
}: {
  row: LeadRow;
  data: LeadDetail;
  businessName: string;
  now: number;
  onClose: () => void;
  onFollowUpNow: () => Promise<unknown>;
  onReply: (text: string) => Promise<unknown>;
  onMarkWon: () => Promise<unknown>;
  onSkip: () => Promise<unknown>;
}) {
  const { lead } = row;
  const [busy, setBusy] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);

  const outreach = data?.outreach ?? null;
  const messages = data?.messages ?? [];
  const canFollowUp =
    outreach?.sentAt !== undefined &&
    outreach?.followUpSentAt === undefined &&
    outreach?.lastReplyAt === undefined;
  const evidence = lead.evidence ? cleanEvidence(lead.evidence) : "";

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast.success(ok);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-3xl">
        <DialogHeader className="border-b bg-gradient-to-b from-sky-50 to-background px-6 pt-6 pb-5 text-left dark:from-blue-950/40">
          <div className="flex items-start gap-4 pr-8">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-slate-50 to-slate-100 font-heading text-lg font-bold text-slate-600 ring-1 ring-slate-200 dark:from-slate-800 dark:to-slate-900 dark:text-slate-200 dark:ring-white/10">
              {initials(lead.name)}
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <DialogTitle className="font-heading text-xl leading-tight font-bold">
                {lead.name}
              </DialogTitle>
              <div className="flex flex-wrap items-center gap-1.5">
                <TypeBadge type={lead.type} />
                <StatusBadge status={lead.status} />
                {outreach?.replyClassification && (
                  <ClassificationBadge classification={outreach.replyClassification} />
                )}
                {lead.score !== undefined && (
                  <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 tabular-nums dark:bg-blue-950 dark:text-blue-300">
                    Score {Math.round(lead.score)}
                  </span>
                )}
              </div>
              <DialogDescription className="flex flex-col gap-0.5 text-xs">
                {lead.address && (
                  <span className="inline-flex items-start gap-1.5">
                    <MapPin className="mt-0.5 size-3 shrink-0" /> {lead.address}
                  </span>
                )}
                {lead.url && (
                  <a
                    href={lead.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 truncate hover:text-foreground"
                  >
                    <ExternalLink className="size-3 shrink-0" />
                    <span className="truncate">{lead.url.replace(/^https?:\/\//, "")}</span>
                  </a>
                )}
                {lead.contactEmail && <span className="font-mono">{lead.contactEmail}</span>}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {(lead.relevanceNote || evidence) && (
            <div className="grid gap-4 md:grid-cols-2">
              {lead.relevanceNote && (
                <div className="rounded-xl bg-muted/50 p-4">
                  <SectionLabel>Why it's a fit</SectionLabel>
                  <p className="mt-1.5 text-sm leading-relaxed">{lead.relevanceNote}</p>
                </div>
              )}
              {evidence && (
                <div className="rounded-xl bg-muted/50 p-4">
                  <SectionLabel>From their site</SectionLabel>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{evidence}</p>
                </div>
              )}
            </div>
          )}

          {data === undefined ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </div>
          ) : (
            <>
              {outreach && outreach.sentAt === undefined && outreach.draftStatus === "ready" && (
                <DraftEditor lead={lead} outreach={outreach} />
              )}
              {outreach && outreach.sentAt === undefined && outreach.draftStatus === "generating" && (
                <div className="flex items-center gap-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Drafting personalized outreach…
                </div>
              )}
              {outreach && outreach.draftStatus === "failed" && outreach.sentAt === undefined && (
                <Alert variant="destructive">
                  <AlertCircle />
                  <AlertTitle>Draft generation failed</AlertTitle>
                  <AlertDescription>See the Activity page for details.</AlertDescription>
                </Alert>
              )}
              {!lead.contactEmail && (
                <Alert>
                  <AlertCircle />
                  <AlertTitle>No contact email found</AlertTitle>
                  <AlertDescription>
                    The agent couldn't find an address on their site, so it can't email them
                    automatically.
                  </AlertDescription>
                </Alert>
              )}

              {messages.length > 0 && (
                <ThreadView messages={messages} businessName={businessName} leadName={lead.name} />
              )}

              {outreach?.sentAt !== undefined && (
                <div className="space-y-2 rounded-xl border p-4">
                  <SectionLabel>Reply as {businessName}</SectionLabel>
                  <Textarea
                    rows={3}
                    className="rounded-xl"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={`Write your reply to ${lead.name}…`}
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      size="sm"
                      disabled={replyBusy || !replyText.trim()}
                      onClick={async () => {
                        setReplyBusy(true);
                        try {
                          await onReply(replyText);
                          setReplyText("");
                          toast.success("Reply sent");
                        } catch (err) {
                          toast.error(errorMessage(err));
                        } finally {
                          setReplyBusy(false);
                        }
                      }}
                    >
                      {replyBusy ? <Loader2 className="animate-spin" /> : <Send />}
                      {replyBusy ? "Sending…" : "Send reply"}
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Sends from the agent inbox into this thread.
                    </span>
                  </div>
                </div>
              )}

              {canFollowUp && outreach?.nextActionAt !== undefined && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
                  <span>
                    Follow-up scheduled for {formatWhen(outreach.nextActionAt)} · in{" "}
                    {formatCountdown(outreach.nextActionAt - now)}
                  </span>
                  <Button
                    variant="brand"
                    size="sm"
                    disabled={busy}
                    onClick={() => void run(onFollowUpNow, "Follow-up sent")}
                  >
                    Send follow-up now
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="border-t bg-muted/40 px-6 py-3 sm:justify-between">
          <div className="flex gap-2">
            {lead.status !== "won" && lead.status !== "skipped" && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                className="text-emerald-700 hover:text-emerald-800 dark:text-emerald-300"
                onClick={() => void run(onMarkWon, "Marked as won")}
              >
                <Trophy /> Mark won
              </Button>
            )}
            {(lead.status === "sourced" || lead.status === "approved") && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(onSkip)}>
                Skip this lead
              </Button>
            )}
          </div>
          <Button size="sm" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LeadDialog({
  row,
  businessName,
  now,
  onClose,
}: {
  row: LeadRow;
  businessName: string;
  now: number;
  onClose: () => void;
}) {
  const data = useQuery(api.outreach.getForLead, { leadId: row.lead._id });
  const followUpNow = useMutation(api.outreach.followUpNow);
  const replyInThread = useMutation(api.outreach.replyInThread);
  const markWon = useMutation(api.leads.markWon);
  const skip = useMutation(api.leads.skip);
  const leadId = row.lead._id;
  return (
    <LeadDialogView
      row={row}
      data={data}
      businessName={businessName}
      now={now}
      onClose={onClose}
      onFollowUpNow={() => followUpNow({ leadId })}
      onReply={(text) => replyInThread({ leadId, text })}
      onMarkWon={() => markWon({ leadId })}
      onSkip={() => skip({ leadId })}
    />
  );
}
