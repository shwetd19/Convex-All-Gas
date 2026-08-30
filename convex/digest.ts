import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { categoryValidator } from "./schema";
import { getAuthUserId } from "@convex-dev/auth/server";
import { extractEmailAddress } from "./lib/parseFrom";

const DEBOUNCE_MS = 20 * 60 * 1000; // 20 minutes of quiet before sending

// Called on every inbound forward. Cancels whatever send was pending *for
// this owner* (the forwarder's address) and reschedules — so a burst of
// forwards from one person only ever fires one digest, ~20 minutes after
// their last one. Each owner has their own row (by_owner), so two people
// sharing the inbox never share a schedule or a batch.
//
// requestedByEmailId is only set on an immediate request, and always
// overwrites (not accumulates) — the most recent trigger wins. sendDigest
// replies to that email specifically when set, even if it has no listings
// of its own, so an explicit "digest now" always gets *some* reply instead
// of silently no-op'ing when nothing else is pending.
export const scheduleDigest = internalMutation({
  args: {
    ownerEmail: v.string(),
    immediate: v.boolean(),
    requestedByEmailId: v.optional(v.id("emails")),
    requestedCategory: v.optional(categoryValidator),
  },
  handler: async (ctx, { ownerEmail, immediate, requestedByEmailId, requestedCategory }) => {
    const existing = await ctx.db
      .query("digestSchedule")
      .withIndex("by_owner", (q) => q.eq("ownerEmail", ownerEmail))
      .unique();

    if (existing?.scheduledFunctionId) {
      await ctx.scheduler.cancel(existing.scheduledFunctionId);
    }

    const delay = immediate ? 0 : DEBOUNCE_MS;
    const scheduledFunctionId = await ctx.scheduler.runAfter(delay, internal.ai.sendDigest, {
      ownerEmail,
    });
    const scheduledFor = Date.now() + delay;
    const patch = {
      ownerEmail,
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

// This owner's listings ready to go out (scored or gave up on) that haven't
// been included in a digest yet.
export const pendingListings = internalQuery({
  args: { ownerEmail: v.string() },
  handler: async (ctx, { ownerEmail }) => {
    const all = await ctx.db.query("listings").collect();
    const pending = all.filter(
      (l) => l.digestedAt === undefined && (l.status === "ranked" || l.status === "failed"),
    );

    const withEmail = [];
    for (const listing of pending) {
      const email = await ctx.db.get(listing.emailId);
      if (email && extractEmailAddress(email.from) === ownerEmail) {
        withEmail.push({ listing, email });
      }
    }
    return withEmail;
  },
});

// Every distinct owner with undigested, settled listings right now — used
// by the safety-net cron to sweep any owner whose schedule was somehow
// lost, without needing to know who they are in advance.
export const pendingOwners = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("listings").collect();
    const pending = all.filter(
      (l) => l.digestedAt === undefined && (l.status === "ranked" || l.status === "failed"),
    );
    const owners = new Set<string>();
    for (const listing of pending) {
      const email = await ctx.db.get(listing.emailId);
      if (email) owners.add(extractEmailAddress(email.from));
    }
    return Array.from(owners);
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
  args: { ownerEmail: v.string() },
  handler: async (ctx, { ownerEmail }) => {
    const existing = await ctx.db
      .query("digestSchedule")
      .withIndex("by_owner", (q) => q.eq("ownerEmail", ownerEmail))
      .unique();
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
      await ctx.db.insert("digestSchedule", { ownerEmail, lastDigestAt: now });
    }
  },
});

// Internal lookup by owner — for use inside sendDigest/the cron, which run
// as scheduled functions with no signed-in user to derive an owner from.
export const getScheduleForOwner = internalQuery({
  args: { ownerEmail: v.string() },
  handler: (ctx, { ownerEmail }) =>
    ctx.db
      .query("digestSchedule")
      .withIndex("by_owner", (q) => q.eq("ownerEmail", ownerEmail))
      .unique(),
});

// Public: the signed-in user's own schedule row, for the dashboard banner.
// Returns null when signed out, or when this account's email has never
// forwarded anything (no schedule row exists for it yet).
export const getSchedule = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user?.email) return null;
    const ownerEmail = user.email.toLowerCase();
    return ctx.db
      .query("digestSchedule")
      .withIndex("by_owner", (q) => q.eq("ownerEmail", ownerEmail))
      .unique();
  },
});
