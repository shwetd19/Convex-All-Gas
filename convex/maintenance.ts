import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

// If a scrape or extraction call never resolves (crash, stuck promise), don't
// let a batch wait forever for its digest. Anything still in-flight after
// this long gets force-failed so the digest goes out with whatever ranked.
const STALL_THRESHOLD_MS = 10 * 60 * 1000;

export const findStalledEmails = internalQuery({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - STALL_THRESHOLD_MS;
    const emails = await ctx.db.query("emails").collect();
    return emails.filter((e) => e.digestSentAt === undefined && e.receivedAt < cutoff);
  },
});

export const forceFailStuckListings = internalMutation({
  args: { emailId: v.id("emails") },
  handler: async (ctx, { emailId }) => {
    const listings = await ctx.db
      .query("listings")
      .withIndex("by_email", (q) => q.eq("emailId", emailId))
      .collect();
    for (const listing of listings) {
      if (listing.status === "pending" || listing.status === "scraping" || listing.status === "scraped") {
        await ctx.db.patch(listing._id, { status: "failed", error: "timed out" });
      }
    }
  },
});

export const checkStalled = internalAction({
  args: {},
  handler: async (ctx) => {
    const stalled = await ctx.runQuery(internal.maintenance.findStalledEmails, {});
    for (const email of stalled) {
      await ctx.runMutation(internal.maintenance.forceFailStuckListings, { emailId: email._id });
      await ctx.runAction(internal.ai.maybeSendDigest, { emailId: email._id });
    }
  },
});
