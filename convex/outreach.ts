import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireOwnedBusiness } from "./businesses";
import { replyClassificationValidator } from "./schema";

const DAY_MS = 24 * 60 * 60 * 1000;

// Lead detail view: the outreach row plus every message in its thread.
export const getForLead = query({
  args: { leadId: v.id("leads") },
  handler: async (ctx, { leadId }) => {
    const lead = await ctx.db.get(leadId);
    if (!lead) return null;
    await requireOwnedBusiness(ctx, lead.businessId);
    const outreach = await ctx.db
      .query("outreach")
      .withIndex("by_leadId", (q) => q.eq("leadId", leadId))
      .first();
    if (!outreach) return { outreach: null, messages: [] };
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_outreachId", (q) => q.eq("outreachId", outreach._id))
      .take(50);
    return { outreach, messages };
  },
});

// Edit the draft before first send.
export const updateDraft = mutation({
  args: { leadId: v.id("leads"), subject: v.string(), draftText: v.string() },
  handler: async (ctx, { leadId, subject, draftText }) => {
    const lead = await ctx.db.get(leadId);
    if (!lead) throw new Error("Lead not found");
    await requireOwnedBusiness(ctx, lead.businessId);
    const outreach = await ctx.db
      .query("outreach")
      .withIndex("by_leadId", (q) => q.eq("leadId", leadId))
      .first();
    if (!outreach) throw new Error("No draft yet");
    if (outreach.sentAt !== undefined) throw new Error("Already sent — reply in the thread instead");
    await ctx.db.patch(outreach._id, { subject, draftText, draftStatus: "ready" });
  },
});

// Manual "send follow-up now" — the override next to the automatic cron.
export const followUpNow = mutation({
  args: { leadId: v.id("leads") },
  handler: async (ctx, { leadId }) => {
    const lead = await ctx.db.get(leadId);
    if (!lead) throw new Error("Lead not found");
    await requireOwnedBusiness(ctx, lead.businessId);
    const outreach = await ctx.db
      .query("outreach")
      .withIndex("by_leadId", (q) => q.eq("leadId", leadId))
      .first();
    if (!outreach || outreach.sentAt === undefined) throw new Error("Nothing sent yet");
    if (outreach.followUpSentAt !== undefined) throw new Error("Follow-up already sent");
    if (outreach.lastReplyAt !== undefined) throw new Error("They already replied");
    // Claim it so the cron can't double-send while the action runs.
    await ctx.db.patch(outreach._id, { nextActionAt: undefined });
    await ctx.scheduler.runAfter(0, internal.pipeline.sendFollowUp, { outreachId: outreach._id });
  },
});

// Owner replies in-thread from the app — the "I'll handle this one
// myself" path that pre-empts the delayed auto-reply.
export const replyInThread = mutation({
  args: { leadId: v.id("leads"), text: v.string() },
  handler: async (ctx, { leadId, text }) => {
    const lead = await ctx.db.get(leadId);
    if (!lead) throw new Error("Lead not found");
    await requireOwnedBusiness(ctx, lead.businessId);
    const outreach = await ctx.db
      .query("outreach")
      .withIndex("by_leadId", (q) => q.eq("leadId", leadId))
      .first();
    if (!outreach || outreach.sentAt === undefined) throw new Error("Nothing sent yet");
    const trimmed = text.trim();
    if (!trimmed) throw new Error("Write a reply first");
    if (trimmed.length > 5000) throw new Error("Reply is too long");
    await ctx.scheduler.runAfter(0, internal.pipeline.sendManualReply, {
      outreachId: outreach._id,
      text: trimmed,
    });
  },
});

// ---- internal (pipeline / crons / webhook) ----

export const get = internalQuery({
  args: { outreachId: v.id("outreach") },
  handler: (ctx, { outreachId }) => ctx.db.get(outreachId),
});

export const getMessageRow = internalQuery({
  args: { messageRowId: v.id("messages") },
  handler: (ctx, { messageRowId }) => ctx.db.get(messageRowId),
});

export const listThreadMessages = internalQuery({
  args: { outreachId: v.id("outreach") },
  handler: (ctx, { outreachId }) =>
    ctx.db
      .query("messages")
      .withIndex("by_outreachId", (q) => q.eq("outreachId", outreachId))
      .take(50),
});

// The owner's own in-app reply, sent through the agent inbox.
export const recordManualReply = internalMutation({
  args: { outreachId: v.id("outreach"), text: v.string() },
  handler: async (ctx, { outreachId, text }) => {
    const outreach = await ctx.db.get(outreachId);
    if (!outreach) return;
    const lead = await ctx.db.get(outreach.leadId);
    await ctx.db.insert("messages", {
      outreachId,
      businessId: outreach.businessId,
      direction: "outbound",
      kind: "manual_reply",
      text,
      sentAt: Date.now(),
    });
    await ctx.db.insert("activity", {
      businessId: outreach.businessId,
      leadId: outreach.leadId,
      kind: "reply",
      message: `You replied to ${lead?.name ?? "lead"} in-thread`,
    });
  },
});

// The agent's own answer to an inbound reply (auto-reply mode).
export const recordAutoReply = internalMutation({
  args: { outreachId: v.id("outreach"), text: v.string() },
  handler: async (ctx, { outreachId, text }) => {
    const outreach = await ctx.db.get(outreachId);
    if (!outreach) return;
    const lead = await ctx.db.get(outreach.leadId);
    await ctx.db.insert("messages", {
      outreachId,
      businessId: outreach.businessId,
      direction: "outbound",
      kind: "auto_reply",
      text,
      sentAt: Date.now(),
    });
    await ctx.db.insert("activity", {
      businessId: outreach.businessId,
      leadId: outreach.leadId,
      kind: "reply",
      message: `Agent replied to ${lead?.name ?? "lead"} in-thread`,
    });
  },
});

export const ensureForLead = internalMutation({
  args: { leadId: v.id("leads"), businessId: v.id("businesses") },
  handler: async (ctx, { leadId, businessId }) => {
    const existing = await ctx.db
      .query("outreach")
      .withIndex("by_leadId", (q) => q.eq("leadId", leadId))
      .first();
    if (existing) return existing._id;
    return await ctx.db.insert("outreach", { leadId, businessId, draftStatus: "generating" });
  },
});

export const saveDraft = internalMutation({
  args: { outreachId: v.id("outreach"), subject: v.string(), draftText: v.string() },
  handler: async (ctx, { outreachId, subject, draftText }) => {
    const outreach = await ctx.db.get(outreachId);
    if (!outreach || outreach.sentAt !== undefined) return;
    await ctx.db.patch(outreachId, { subject, draftText, draftStatus: "ready" });
    const lead = await ctx.db.get(outreach.leadId);
    if (lead) {
      await ctx.db.insert("activity", {
        businessId: outreach.businessId,
        leadId: outreach.leadId,
        kind: "draft",
        message: `Draft ready for ${lead.name}`,
      });
    }
  },
});

export const saveDraftFailure = internalMutation({
  args: { outreachId: v.id("outreach"), error: v.string() },
  handler: async (ctx, { outreachId, error }) => {
    const outreach = await ctx.db.get(outreachId);
    if (!outreach) return;
    await ctx.db.patch(outreachId, { draftStatus: "failed" });
    const lead = await ctx.db.get(outreach.leadId);
    await ctx.db.insert("activity", {
      businessId: outreach.businessId,
      leadId: outreach.leadId,
      kind: "system",
      message: `Drafting for ${lead?.name ?? "a lead"} failed: ${error.slice(0, 160)}`,
    });
  },
});

// Auto-send mode: approve without a human click, then send.
export const markApproved = internalMutation({
  args: { outreachId: v.id("outreach") },
  handler: async (ctx, { outreachId }) => {
    const outreach = await ctx.db.get(outreachId);
    if (!outreach || outreach.draftStatus !== "ready" || outreach.sentAt !== undefined) return false;
    const lead = await ctx.db.get(outreach.leadId);
    if (!lead || lead.status !== "sourced" || !lead.contactEmail) return false;
    await ctx.db.patch(lead._id, { status: "approved" });
    await ctx.db.insert("activity", {
      businessId: outreach.businessId,
      leadId: lead._id,
      kind: "sent",
      message: `Auto-approved outreach to ${lead.name} (auto-send is on) — sending…`,
    });
    return true;
  },
});

export const markSent = internalMutation({
  args: {
    outreachId: v.id("outreach"),
    inboxId: v.string(),
    agentmailMessageId: v.string(),
    agentmailThreadId: v.string(),
  },
  handler: async (ctx, { outreachId, inboxId, agentmailMessageId, agentmailThreadId }) => {
    const outreach = await ctx.db.get(outreachId);
    if (!outreach) return;
    const business = await ctx.db.get(outreach.businessId);
    const lead = await ctx.db.get(outreach.leadId);
    const now = Date.now();
    const delayDays = business?.followUpDelayDays ?? 4;
    await ctx.db.patch(outreachId, {
      inboxId,
      agentmailMessageId,
      agentmailThreadId,
      sentAt: now,
      nextActionAt: now + delayDays * DAY_MS,
    });
    if (lead) await ctx.db.patch(lead._id, { status: "outreach_sent" });
    await ctx.db.insert("messages", {
      outreachId,
      businessId: outreach.businessId,
      direction: "outbound",
      kind: "initial",
      subject: outreach.subject,
      text: outreach.draftText ?? "",
      agentmailMessageId,
      sentAt: now,
    });
    await ctx.db.insert("activity", {
      businessId: outreach.businessId,
      leadId: outreach.leadId,
      kind: "sent",
      message: `Outreach sent to ${lead?.name ?? "lead"} (${lead?.contactEmail ?? "?"})`,
    });
  },
});

export const markSendFailed = internalMutation({
  args: { outreachId: v.id("outreach"), error: v.string() },
  handler: async (ctx, { outreachId, error }) => {
    const outreach = await ctx.db.get(outreachId);
    if (!outreach) return;
    const lead = await ctx.db.get(outreach.leadId);
    await ctx.db.insert("activity", {
      businessId: outreach.businessId,
      leadId: outreach.leadId,
      kind: "system",
      message: `Sending to ${lead?.name ?? "a lead"} failed: ${error.slice(0, 160)}`,
    });
  },
});

export const markFollowedUp = internalMutation({
  args: { outreachId: v.id("outreach"), text: v.string() },
  handler: async (ctx, { outreachId, text }) => {
    const outreach = await ctx.db.get(outreachId);
    if (!outreach) return;
    const business = await ctx.db.get(outreach.businessId);
    const lead = await ctx.db.get(outreach.leadId);
    const now = Date.now();
    const delayDays = business?.followUpDelayDays ?? 4;
    await ctx.db.patch(outreachId, {
      followUpSentAt: now,
      // One follow-up only — the next cron action on this row marks it cold.
      nextActionAt: now + delayDays * DAY_MS,
    });
    if (lead && lead.status === "outreach_sent") {
      await ctx.db.patch(lead._id, { status: "followed_up" });
    }
    await ctx.db.insert("messages", {
      outreachId,
      businessId: outreach.businessId,
      direction: "outbound",
      kind: "follow_up",
      text,
      sentAt: now,
    });
    await ctx.db.insert("activity", {
      businessId: outreach.businessId,
      leadId: outreach.leadId,
      kind: "follow_up",
      message: `Follow-up sent to ${lead?.name ?? "lead"}`,
    });
  },
});

export const saveClassification = internalMutation({
  args: {
    outreachId: v.id("outreach"),
    messageRowId: v.id("messages"),
    classification: replyClassificationValidator,
  },
  handler: async (ctx, { outreachId, messageRowId, classification }) => {
    const outreach = await ctx.db.get(outreachId);
    if (!outreach) return;
    await ctx.db.patch(outreachId, { replyClassification: classification });
    await ctx.db.patch(messageRowId, { classification });
    const lead = await ctx.db.get(outreach.leadId);
    const label =
      classification === "interested"
        ? "interested"
        : classification === "not_interested"
          ? "not interested"
          : "needs info";
    await ctx.db.insert("activity", {
      businessId: outreach.businessId,
      leadId: outreach.leadId,
      kind: "reply",
      message: `Reply from ${lead?.name ?? "lead"} — classified: ${label}`,
    });
  },
});
