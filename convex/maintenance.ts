import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal, api } from "./_generated/api";

// If a scrape or extraction call never resolves (crash, stuck promise), don't
// let a listing block its digest forever. Anything still in-flight after
// this long gets force-failed so the next digest goes out with whatever
// ranked.
const STALL_THRESHOLD_MS = 10 * 60 * 1000;

export const findStuckListings = internalQuery({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - STALL_THRESHOLD_MS;
    const listings = await ctx.db.query("listings").collect();
    return listings.filter(
      (l) =>
        (l.status === "pending" || l.status === "scraping" || l.status === "scraped") &&
        l._creationTime < cutoff,
    );
  },
});

export const forceFailListing = internalMutation({
  args: { listingId: v.id("listings") },
  handler: async (ctx, { listingId }) => {
    await ctx.db.patch(listingId, { status: "failed", error: "timed out" });
  },
});

// The debounced schedule in convex/digest.ts should always cover new
// content, but if it's ever lost (e.g. a scheduled function silently
// failed) this is the backstop: if there's undigested, settled content and
// no send currently scheduled, schedule one now.
export const checkStalled = internalAction({
  args: {},
  handler: async (ctx) => {
    const stuck = await ctx.runQuery(internal.maintenance.findStuckListings, {});
    for (const listing of stuck) {
      await ctx.runMutation(internal.maintenance.forceFailListing, { listingId: listing._id });
    }

    const pending = await ctx.runQuery(internal.digest.pendingListings, {});
    if (pending.length === 0) return;

    const schedule = await ctx.runQuery(api.digest.getSchedule, {});
    if (!schedule?.scheduledFunctionId) {
      await ctx.runMutation(internal.digest.scheduleDigest, { immediate: true });
    }
  },
});
