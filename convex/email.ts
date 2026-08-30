import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { internal, components } from "./_generated/api";
import { AgentMail } from "@agentmail/convex";
import { extractListingUrls, extractPreferenceNote, parseDigestCommand } from "./lib/extractUrls";
import { extractEmailAddress } from "./lib/parseFrom";
import { fetchMessage } from "./lib/agentmailRest";

// Shared AgentMail handle: configured with the hook AgentMail calls on every
// inbound message. Re-used by convex/http.ts so the webhook route dispatches
// through the same config.
//
// Explicit type annotation breaks a circularity: `internal.email.*` is
// generated from this file's own exports, so inferring `agentmail`'s type
// from an expression that references `internal.email.onMessageReceived`
// would otherwise depend on itself.
export const agentmail: AgentMail = new AgentMail(components.agentmail, {
  onMessageReceived: internal.email.onMessageReceived,
});

function toMillis(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Date.now();
}

const ingestArgs = {
  messageId: v.string(),
  threadId: v.string(),
  inboxId: v.string(),
  from: v.string(),
  subject: v.optional(v.string()),
  receivedAt: v.number(),
};

// Webhook entry point. AgentMail includes text/html in the event for small
// messages only; past a size threshold it sends a body_url instead and no
// body at all. A job-alert forward is easily 50-70 KB of HTML, so treating
// a missing body as an empty email silently ingested nothing. When the body
// isn't in the event, fetch the full message over REST first, then ingest.
export const onMessageReceived = internalMutation({
  args: { message: v.any(), thread: v.any(), eventId: v.string() },
  handler: async (ctx, args) => {
    const message = args.message as Record<string, unknown>;
    const messageId = (message.message_id ?? message.messageId) as string | undefined;
    const threadId = (message.thread_id ?? message.threadId) as string | undefined;
    const inboxId = (message.inbox_id ?? message.inboxId) as string | undefined;
    if (!messageId || !threadId || !inboxId) return;

    const meta = {
      messageId,
      threadId,
      inboxId,
      from: ((message.from ?? message.from_) as string) ?? "unknown",
      subject: message.subject as string | undefined,
      receivedAt: toMillis(message.timestamp ?? message.created_at),
    };
    const text = ((message.text ?? "") as string).toString();
    const html = ((message.html ?? "") as string).toString();

    if (text || html) {
      await ctx.runMutation(internal.email.ingest, { ...meta, text, html });
    } else {
      await ctx.scheduler.runAfter(0, internal.email.fetchBodyAndIngest, meta);
    }
  },
});

export const fetchBodyAndIngest = internalAction({
  args: ingestArgs,
  handler: async (ctx, meta) => {
    let text = "";
    let html = "";
    try {
      const full = await fetchMessage(meta.inboxId, meta.messageId);
      text = (full.text ?? "").toString();
      html = (full.html ?? "").toString();
    } catch (err) {
      // Ingest anyway so the forward is visible on the dashboard as
      // "no links found" rather than vanishing; the error is in the logs.
      console.error("AgentMail body fetch failed", meta.messageId, err);
    }
    await ctx.runMutation(internal.email.ingest, { ...meta, text, html });
  },
});

export const ingest = internalMutation({
  args: { ...ingestArgs, text: v.string(), html: v.string() },
  handler: async (ctx, { messageId, threadId, inboxId, from, subject, receivedAt, text, html }) => {
    // AgentMail can redeliver webhooks; skip mail we've already ingested.
    const existing = await ctx.db
      .query("emails")
      .withIndex("by_agentmail_message", (q) => q.eq("agentmailMessageId", messageId))
      .unique();
    if (existing) return;

    // A reply in a thread we've already sent a digest in is steering
    // ("skip #2", "more like #3"), not a new forward. It quotes the whole
    // digest underneath, so we must NOT run URL extraction on it — that
    // would re-ingest every link in the digest as a fresh listing.
    const digest = await ctx.runQuery(internal.emails.getDigestByThread, {
      agentmailThreadId: threadId,
    });
    if (digest) {
      const emailId = await ctx.db.insert("emails", {
        agentmailMessageId: messageId,
        agentmailThreadId: threadId,
        inboxId,
        from,
        subject,
        receivedAt,
        isFeedback: true,
      });
      await ctx.scheduler.runAfter(0, internal.ai.handleFeedbackReply, {
        emailId,
        digestId: digest._id,
        text: text || html,
      });
      return;
    }

    const urls = extractListingUrls(text, html);
    const preferenceNote = extractPreferenceNote(text || html);

    const emailId = await ctx.db.insert("emails", {
      agentmailMessageId: messageId,
      agentmailThreadId: threadId,
      inboxId,
      from,
      subject,
      receivedAt,
      preferenceNote,
    });

    for (const url of urls) {
      const listingId = await ctx.db.insert("listings", {
        emailId,
        url,
        status: "pending",
      });
      await ctx.scheduler.runAfter(0, internal.listings.scrapeListing, { listingId });
    }

    // Every forward (even a "digest now" with no new links, or one whose
    // listings haven't finished processing yet) reschedules the batched
    // send for this forwarder specifically — see convex/digest.ts.
    const { immediate, category } = parseDigestCommand(subject, preferenceNote);
    await ctx.runMutation(internal.digest.scheduleDigest, {
      ownerEmail: extractEmailAddress(from),
      immediate,
      requestedByEmailId: immediate ? emailId : undefined,
      requestedCategory: immediate ? category : undefined,
    });
  },
});
