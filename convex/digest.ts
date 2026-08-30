import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { categoryValidator } from "./schema";

const DEBOUNCE_MS = 20 * 60 * 1000; // 20 minutes of quiet before sending

// Called on every inbound forward. Cancels whatever send was pending and
// reschedules — so a burst of forwards only ever fires one digest, ~20
// minutes after the *last* one. `immediate` (the "digest now" keyword)
// skips the wait and fires right away instead.
//
// requestedByEmailId is only set on an immediate request, and always
// overwrites (not accumulates) — the most recent trigger wins. sendDigest
// replies to that email specifically when set, even if it has no listings
// of its own, so an explicit "digest now" always gets *some* reply instead
// of silently no-op'ing when nothing else is pending.
export const scheduleDigest = internalMutation({
  args: {
    immediate: v.boolean(),
    requestedByEmailId: v.optional(v.id("emails")),
    requestedCategory: v.optional(categoryValidator),
  },
  handler: async (ctx, { immediate, requestedByEmailId, requestedCategory }) => {
    const existing = await ctx.db.query("digestSchedule").first();

    if (existing?.scheduledFunctionId) {
      await ctx.scheduler.cancel(existing.scheduledFunctionId);
    }

    const delay = immediate ? 0 : DEBOUNCE_MS;
    const scheduledFunctionId = await ctx.scheduler.runAfter(delay, internal.ai.sendDigest, {});
    const scheduledFor = Date.now() + delay;
    const patch = {
      scheduledFunctionId,
      scheduledFor,
      requestedByEmailId: immediate ? requestedByEmailId : undefined,
      requestedCategory: immediate ? requestedCategory : undefined,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("digestSchedule", patch);
    }
  },
});

// Listings ready to go out (scored or gave up on) that haven't been
// included in a digest yet, newest email first so the reply target
// (most recent thread) is easy to pick.
export const pendingListings = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("listings").collect();
    const pending = all.filter(
      (l) => l.digestedAt === undefined && (l.status === "ranked" || l.status === "failed"),
    );

    const withEmail = [];
    for (const listing of pending) {
      const email = await ctx.db.get(listing.emailId);
      if (email) withEmail.push({ listing, email });
    }
    return withEmail;
  },
});

export const markDigested = internalMutation({
  args: { listingIds: v.array(v.id("listings")) },
  handler: async (ctx, { listingIds }) => {
    const now = Date.now();
    for (const id of listingIds) {
      await ctx.db.patch(id, { digestedAt: now });
    }
  },
});

export const finishSchedule = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("digestSchedule").first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        scheduledFunctionId: undefined,
        scheduledFor: undefined,
        requestedByEmailId: undefined,
        requestedCategory: undefined,
        lastDigestAt: now,
      });
    } else {
      await ctx.db.insert("digestSchedule", { lastDigestAt: now });
    }
  },
});

export const getSchedule = query({
  args: {},
  handler: (ctx) => ctx.db.query("digestSchedule").first(),
});
