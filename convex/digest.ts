// Weekly digest: once a week each active business's owner gets one short email
// summarizing what the agent did on their block — new leads, outreach sent,
// replies, and drafts waiting for review. Reuses the AgentMail app inbox and
// the owner's signup address (same plumbing as the reply notification).
// agentmailApiFetch is plain fetch, so this runs in the default runtime.

import { internalAction, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { agentmailApiFetch } from "./lib/agentmailRest";
import { textToHtml } from "./lib/text";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Ready, non-demo businesses whose owner opted into the weekly cadence.
export const businessesForDigest = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("businesses").take(5000);
    return all
      .filter((b) => b.status === "ready" && !b.isDemo && b.weeklyRescan !== false)
      .map((b) => ({ _id: b._id, name: b.name ?? b.url, userId: b.userId }));
  },
});

// Counts for the last 7 days for one business, plus the standing review queue.
export const statsForBusiness = internalQuery({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, { businessId }) => {
    const cutoff = Date.now() - WEEK_MS;
    const leads = await ctx.db
      .query("leads")
      .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
      .collect();
    const outreach = await ctx.db
      .query("outreach")
      .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
      .collect();

    const newLeads = leads.filter((l) => l._creationTime >= cutoff && l.status !== "skipped").length;
    const sent = outreach.filter((o) => o.sentAt !== undefined && o.sentAt >= cutoff).length;
    const replies = outreach.filter((o) => o.lastReplyAt !== undefined && o.lastReplyAt >= cutoff).length;
    const draftsReady = outreach.filter(
      (o) => o.draftStatus === "ready" && o.sentAt === undefined,
    ).length;

    return { newLeads, sent, replies, draftsReady };
  },
});

// Cron entry point: send each opted-in business's owner a digest, skipping any
// week with nothing to report so owners never get an empty email.
export const weeklyDigest = internalAction({
  args: {},
  handler: async (ctx) => {
    const businesses = await ctx.runQuery(internal.digest.businessesForDigest, {});
    if (businesses.length === 0) return;

    const inbox = await ctx.runQuery(internal.inbox.getInternal, {});
    if (!inbox) return; // no app inbox provisioned — nothing to send from
    const siteUrl = process.env.CONVEX_SITE_URL ?? "";

    for (const biz of businesses) {
      const stats = await ctx.runQuery(internal.digest.statsForBusiness, { businessId: biz._id });
      if (stats.newLeads + stats.sent + stats.replies + stats.draftsReady === 0) continue;

      const owner = await ctx.runQuery(internal.users.getById, { userId: biz.userId });
      if (!owner?.email) continue;

      const lines = [
        `Here's what your agent did on your block this week for ${biz.name}:`,
        "",
        `• ${stats.newLeads} new lead${stats.newLeads === 1 ? "" : "s"} sourced`,
        `• ${stats.sent} outreach email${stats.sent === 1 ? "" : "s"} sent`,
        `• ${stats.replies} repl${stats.replies === 1 ? "y" : "ies"} received`,
        `• ${stats.draftsReady} draft${stats.draftsReady === 1 ? "" : "s"} waiting for your review`,
        "",
        stats.draftsReady > 0
          ? "You have drafts to review — open Block to approve and send them:"
          : "Open Block to see the details:",
        siteUrl,
      ];
      const body = lines.join("\n");

      try {
        await agentmailApiFetch(`/inboxes/${encodeURIComponent(inbox.inboxId)}/messages/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: [owner.email],
            subject: `Your Block weekly digest — ${biz.name}`,
            text: body,
            html: textToHtml(body),
          }),
        });
      } catch (err) {
        console.error("Weekly digest send failed", biz._id, err);
      }
    }
  },
});
