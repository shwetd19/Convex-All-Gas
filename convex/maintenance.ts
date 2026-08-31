import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

// One-shot ops utility for the auto-reply opt-in change: flip every
// existing business to the new off-by-default. Run via `npx convex run`.
export const disableAutoReplyEverywhere = internalMutation({
  args: {},
  handler: async (ctx) => {
    const businesses = await ctx.db.query("businesses").take(200);
    for (const business of businesses) {
      if (business.autoReply !== false) {
        await ctx.db.patch(business._id, { autoReply: false });
      }
    }
    return businesses.length;
  },
});

// Test/ops utility: point a lead's outreach at a different address (e.g.
// your own inbox to test the send → reply → auto-reply loop end to end).
// Internal only — run via `npx convex run`.
export const setLeadContactEmail = internalMutation({
  args: { leadId: v.id("leads"), contactEmail: v.string() },
  handler: async (ctx, { leadId, contactEmail }) => {
    const lead = await ctx.db.get(leadId);
    if (!lead) throw new Error("Lead not found");
    await ctx.db.patch(leadId, { contactEmail: contactEmail.trim().toLowerCase() });
    await ctx.db.insert("activity", {
      businessId: lead.businessId,
      leadId,
      kind: "system",
      message: `Contact email for ${lead.name} changed to ${contactEmail.trim().toLowerCase()} (manual override)`,
    });
    return null;
  },
});

// Cron sweep over outreach rows whose nextActionAt has passed:
// - reply came in → nothing to do (clear the marker)
// - no reply, no follow-up yet → send the one follow-up
// - no reply after the follow-up → mark the lead cold, stop (PLAN.md
//   guardrail: one follow-up per lead, then stop)
export const followUpSweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.db
      .query("outreach")
      .withIndex("by_nextActionAt", (q) => q.gt("nextActionAt", 0).lt("nextActionAt", now))
      .take(20);

    for (const outreach of due) {
      // Claim the row first so a concurrent sweep can't double-fire.
      await ctx.db.patch(outreach._id, { nextActionAt: undefined });

      if (outreach.lastReplyAt !== undefined) continue;

      if (outreach.followUpSentAt === undefined) {
        await ctx.scheduler.runAfter(0, internal.pipeline.sendFollowUp, {
          outreachId: outreach._id,
        });
        continue;
      }

      const lead = await ctx.db.get(outreach.leadId);
      if (!lead || lead.status === "won" || lead.status === "replied") continue;
      await ctx.db.patch(lead._id, { status: "cold" });
      await ctx.db.insert("activity", {
        businessId: outreach.businessId,
        leadId: outreach.leadId,
        kind: "system",
        message: `No reply from ${lead.name} after the follow-up — marked cold`,
      });
    }
  },
});

// Weekly rescan: the standing job. Every business with rescan enabled gets
// a fresh sourcing pass; placeId/url dedupe means only new leads surface.
export const weeklyRescan = internalMutation({
  args: {},
  handler: async (ctx) => {
    const businesses = await ctx.db.query("businesses").take(100);
    for (const business of businesses) {
      if (!business.weeklyRescan || business.status !== "ready") continue;
      await ctx.db.insert("activity", {
        businessId: business._id,
        kind: "system",
        message: "Weekly rescan started — checking for new nearby competitors and events…",
      });
      await ctx.scheduler.runAfter(0, internal.pipeline.sourceLeads, {
        businessId: business._id,
        rescan: true,
      });
    }
  },
});
