import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { requireBusinessRead } from "./businesses";

// One line in the live "watch the agent work" feed.
export const log = internalMutation({
  args: {
    businessId: v.id("businesses"),
    leadId: v.optional(v.id("leads")),
    kind: v.string(),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("activity", args);
  },
});

// Reverse-chronological feed for one of the signed-in user's businesses.
export const list = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, { businessId }) => {
    await requireBusinessRead(ctx, businessId);
    return await ctx.db
      .query("activity")
      .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
      .order("desc")
      .take(100);
  },
});

// A message that signals something went wrong or was held/skipped — used for
// the "issues" bucket in the health summary and the Activity issue filter.
const ISSUE_RE = /\b(fail|failed|skipped?|held|bounced|unsubscrib|error|couldn't|can't|invalid|limit)\b/i;

// Health summary for the last 7 days: what the agent did and how many issues
// need attention, so problems surface instead of dropping silently.
export const health = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, { businessId }) => {
    await requireBusinessRead(ctx, businessId);
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recent = await ctx.db
      .query("activity")
      .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
      .order("desc")
      .take(500);
    const window = recent.filter((a) => a._creationTime >= cutoff);
    const isIssue = (a: { kind: string; message: string }) =>
      a.kind === "error" || (a.kind === "system" && ISSUE_RE.test(a.message));
    return {
      sourced: window.filter((a) => a.kind === "sourcing").length,
      sent: window.filter((a) => a.kind === "sent").length,
      replies: window.filter((a) => a.kind === "reply").length,
      followUps: window.filter((a) => a.kind === "follow_up").length,
      issues: window.filter(isIssue).length,
    };
  },
});
