import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { internal, components } from "./_generated/api";
import { AgentMail } from "@agentmail/convex";
import { extractEmailAddress } from "./lib/parseFrom";
import { extractReplyText, htmlToText } from "./lib/text";
import { fetchMessage } from "./lib/agentmailRest";

// Shared AgentMail handle: configured with the hook AgentMail calls on every
// inbound message. Re-used by convex/http.ts so the webhook route dispatches
// through the same config.
//
// Explicit type annotation breaks a circularity: `internal.email.*` is
// generated from this file's own exports.
export const agentmail: AgentMail = new AgentMail(components.agentmail, {
  onMessageReceived: internal.email.onMessageReceived,
});

const replyMeta = {
  outreachId: v.id("outreach"),
  agentmailMessageId: v.string(),
  inboxId: v.string(),
  from: v.string(),
  subject: v.optional(v.string()),
};

// Webhook entry point. An inbound message in a thread we sent outreach in
// is a reply from that lead — record it and classify it. Anything else
// (spam, mail in unknown threads) is ignored.
export const onMessageReceived = internalMutation({
  args: { message: v.any(), thread: v.any(), eventId: v.string() },
  handler: async (ctx, args) => {
    const message = args.message as Record<string, unknown>;
    const messageId = (message.message_id ?? message.messageId) as string | undefined;
    const threadId = (message.thread_id ?? message.threadId) as string | undefined;
    const inboxId = (message.inbox_id ?? message.inboxId) as string | undefined;
    if (!messageId || !threadId || !inboxId) return;

    const from = ((message.from ?? message.from_) as string) ?? "unknown";

    // Our own outbound mail can echo back through the webhook — skip it.
    const appInbox = await ctx.db.query("appInbox").first();
    if (appInbox && extractEmailAddress(from) === appInbox.email.toLowerCase()) return;

    const outreach = await ctx.db
      .query("outreach")
      .withIndex("by_agentmailThreadId", (q) => q.eq("agentmailThreadId", threadId))
      .first();
    if (!outreach) {
      console.log("Inbound message in unknown thread, ignoring", threadId);
      return;
    }

    const meta = {
      outreachId: outreach._id,
      agentmailMessageId: messageId,
      inboxId,
      from,
      subject: message.subject as string | undefined,
    };
    const text = ((message.text ?? "") as string).toString();
    const html = ((message.html ?? "") as string).toString();

    // AgentMail omits the body for large messages (body_url instead) —
    // fetch over REST first when it's missing, same fix as before.
    if (text || html) {
      await ctx.runMutation(internal.email.recordReply, { ...meta, text, html });
    } else {
      await ctx.scheduler.runAfter(0, internal.email.fetchBodyAndRecord, meta);
    }
  },
});

export const fetchBodyAndRecord = internalAction({
  args: replyMeta,
  handler: async (ctx, meta) => {
    let text = "";
    let html = "";
    try {
      const full = await fetchMessage(meta.inboxId, meta.agentmailMessageId);
      text = (full.text ?? "").toString();
      html = (full.html ?? "").toString();
    } catch (err) {
      console.error("AgentMail body fetch failed", meta.agentmailMessageId, err);
    }
    await ctx.runMutation(internal.email.recordReply, { ...meta, text, html });
  },
});

export const recordReply = internalMutation({
  args: { ...replyMeta, text: v.string(), html: v.string() },
  handler: async (ctx, { outreachId, agentmailMessageId, from, subject, text, html }) => {
    // Webhooks can redeliver — skip replies we've already recorded.
    const existing = await ctx.db
      .query("messages")
      .withIndex("by_agentmailMessageId", (q) => q.eq("agentmailMessageId", agentmailMessageId))
      .first();
    if (existing) return;

    const outreach = await ctx.db.get(outreachId);
    if (!outreach) return;
    const lead = await ctx.db.get(outreach.leadId);

    const raw = text || htmlToText(html);
    const replyText = extractReplyText(raw) || raw.slice(0, 4000);
    const now = Date.now();

    const messageRowId = await ctx.db.insert("messages", {
      outreachId,
      businessId: outreach.businessId,
      direction: "inbound",
      kind: "reply",
      subject,
      text: replyText,
      from,
      agentmailMessageId,
      sentAt: now,
    });

    // A reply cancels any pending follow-up / cold transition.
    await ctx.db.patch(outreachId, { lastReplyAt: now, nextActionAt: undefined });
    if (lead && lead.status !== "won") {
      await ctx.db.patch(lead._id, { status: "replied" });
    }
    await ctx.db.insert("activity", {
      businessId: outreach.businessId,
      leadId: outreach.leadId,
      kind: "reply",
      message: `Reply received from ${lead?.name ?? extractEmailAddress(from)}`,
    });

    await ctx.scheduler.runAfter(0, internal.pipeline.classifyReply, {
      outreachId,
      messageRowId,
      text: replyText,
    });
  },
});
