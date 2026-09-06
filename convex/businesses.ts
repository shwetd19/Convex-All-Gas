import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import { MAX_BUSINESSES, businessLimitMessage, countOwnBusinesses } from "./limits";

// A user can run any number of businesses. Every public function takes the
// businessId it operates on and verifies ownership server-side — never
// trusting the client beyond "which of MY businesses".
//
// Write path: only the owner, and never the shared demo (which is read-only for
// everyone, including the account that technically owns the row).
export async function requireOwnedBusiness(ctx: QueryCtx, businessId: Id<"businesses">) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not signed in");
  const business = await ctx.db.get(businessId);
  if (!business) throw new Error("Not your business");
  if (business.isDemo) {
    throw new Error("This is the shared demo workspace — add your own business to run real outreach.");
  }
  if (business.userId !== userId) throw new Error("Not your business");
  return business;
}

// Read path: the owner, or ANY signed-in user when it's the shared demo. Used
// by the dashboard queries (leads / activity / thread) so everyone can explore
// the demo, while writes stay locked down via requireOwnedBusiness above.
export async function requireBusinessRead(ctx: QueryCtx, businessId: Id<"businesses">) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not signed in");
  const business = await ctx.db.get(businessId);
  if (!business) throw new Error("Not found");
  if (business.isDemo || business.userId === userId) return business;
  throw new Error("Not your business");
}

// Add a business: "Paste your business URL". Always creates a new one —
// users can run several in parallel.
export const create = mutation({
  args: { url: v.string() },
  handler: async (ctx, { url }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");
    // Free-tier cap: at most MAX_BUSINESSES per account (demo excluded).
    if ((await countOwnBusinesses(ctx, userId)) >= MAX_BUSINESSES) {
      throw new Error(businessLimitMessage);
    }
    const trimmed = url.trim();
    if (!trimmed) throw new Error("Enter your business URL");
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

    const businessId = await ctx.db.insert("businesses", {
      userId,
      url: normalized,
      status: "scraping",
      approvalMode: "approve_each",
      followUpDelayDays: 2,
      weeklyRescan: true,
      // The agent answering real third parties unsupervised is an explicit
      // opt-in — the owner chooses how much autonomy to hand over.
      autoReply: false,
    });
    await ctx.scheduler.runAfter(0, internal.pipeline.intakeBusiness, { businessId });
    return businessId;
  },
});

// All of the signed-in user's businesses, newest first — plus the shared,
// read-only demo workspace appended at the end so every user has a populated
// Block to explore. The demo is deduped for the account that owns its row.
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const own = await ctx.db
      .query("businesses")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50);
    const demo = await ctx.db
      .query("businesses")
      .withIndex("by_isDemo", (q) => q.eq("isDemo", true))
      .first();
    if (demo && !own.some((b) => b._id === demo._id)) return [...own, demo];
    return own;
  },
});

// Onboarding: "Is this you?" → kick off the sourcing pipeline.
export const confirm = mutation({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, { businessId }) => {
    const business = await requireOwnedBusiness(ctx, businessId);
    if (business.status !== "confirm") throw new Error("Nothing to confirm");
    await ctx.db.patch(businessId, { status: "sourcing" });
    await ctx.scheduler.runAfter(0, internal.pipeline.sourceLeads, {
      businessId,
      rescan: false,
    });
  },
});

// Re-run intake on the same URL after a failure.
export const retryIntake = mutation({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, { businessId }) => {
    const business = await requireOwnedBusiness(ctx, businessId);
    if (business.status !== "failed") throw new Error("Nothing to retry");
    await ctx.db.patch(businessId, { status: "scraping", error: undefined });
    await ctx.scheduler.runAfter(0, internal.pipeline.intakeBusiness, { businessId });
  },
});

// Delete a business and everything under it ("Not me — start over", or
// removing one from the switcher).
export const remove = mutation({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, { businessId }) => {
    const business = await requireOwnedBusiness(ctx, businessId);
    const leads = await ctx.db
      .query("leads")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();
    for (const lead of leads) await ctx.db.delete(lead._id);
    const outreach = await ctx.db
      .query("outreach")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();
    for (const o of outreach) {
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_outreachId", (q) => q.eq("outreachId", o._id))
        .collect();
      for (const m of messages) await ctx.db.delete(m._id);
      await ctx.db.delete(o._id);
    }
    const activity = await ctx.db
      .query("activity")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();
    for (const a of activity) await ctx.db.delete(a._id);
    await ctx.db.delete(business._id);
  },
});

// Profile page: owner-editable business details. Everything here also
// flows into the agent's outreach prompts.
export const updateProfile = mutation({
  args: {
    businessId: v.id("businesses"),
    name: v.optional(v.string()),
    category: v.optional(v.string()),
    description: v.optional(v.string()),
    teamSize: v.optional(v.string()),
    domain: v.optional(v.string()),
    foundedYear: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { businessId, ...fields }) => {
    await requireOwnedBusiness(ctx, businessId);
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) patch[key] = value.trim();
    }
    await ctx.db.patch(businessId, patch);
  },
});

export const updateSettings = mutation({
  args: {
    businessId: v.id("businesses"),
    approvalMode: v.optional(v.union(v.literal("approve_each"), v.literal("auto_send"))),
    followUpDelayDays: v.optional(v.number()),
    weeklyRescan: v.optional(v.boolean()),
    autoReply: v.optional(v.boolean()),
    bookingUrl: v.optional(v.string()),
  },
  handler: async (ctx, { businessId, ...args }) => {
    await requireOwnedBusiness(ctx, businessId);
    const patch: Record<string, unknown> = {};
    if (args.approvalMode !== undefined) patch.approvalMode = args.approvalMode;
    if (args.followUpDelayDays !== undefined) {
      patch.followUpDelayDays = Math.min(30, Math.max(1, Math.round(args.followUpDelayDays)));
    }
    if (args.weeklyRescan !== undefined) patch.weeklyRescan = args.weeklyRescan;
    if (args.autoReply !== undefined) patch.autoReply = args.autoReply;
    if (args.bookingUrl !== undefined) {
      const url = args.bookingUrl.trim();
      patch.bookingUrl = url === "" ? undefined : /^https?:\/\//i.test(url) ? url : `https://${url}`;
    }
    await ctx.db.patch(businessId, patch);
  },
});

// Manual "rescan now" — same pipeline the weekly cron kicks off.
export const rescanNow = mutation({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, { businessId }) => {
    const business = await requireOwnedBusiness(ctx, businessId);
    if (business.status !== "ready") throw new Error("Finish setup first");
    await ctx.db.insert("activity", {
      businessId,
      kind: "system",
      message: "Manual rescan started — checking for new nearby leads…",
    });
    await ctx.scheduler.runAfter(0, internal.pipeline.sourceLeads, {
      businessId,
      rescan: true,
    });
  },
});

// ---- internal (pipeline) ----

export const getById = internalQuery({
  args: { businessId: v.id("businesses") },
  handler: (ctx, { businessId }) => ctx.db.get(businessId),
});

export const saveProfile = internalMutation({
  args: {
    businessId: v.id("businesses"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    offerings: v.optional(v.array(v.string())),
    category: v.optional(v.string()),
    address: v.optional(v.string()),
    placeId: v.optional(v.string()),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
  },
  handler: async (ctx, { businessId, ...profile }) => {
    await ctx.db.patch(businessId, {
      ...profile,
      status: "confirm",
      scrapedAt: Date.now(),
      error: undefined,
    });
  },
});

export const fail = internalMutation({
  args: { businessId: v.id("businesses"), error: v.string() },
  handler: async (ctx, { businessId, error }) => {
    await ctx.db.patch(businessId, { status: "failed", error });
  },
});

export const setScanWindow = internalMutation({
  args: { businessId: v.id("businesses"), scanUntil: v.number() },
  handler: async (ctx, { businessId, scanUntil }) => {
    await ctx.db.patch(businessId, { scanUntil });
  },
});

export const markScanned = internalMutation({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, { businessId }) => {
    await ctx.db.patch(businessId, { status: "ready", lastScanAt: Date.now() });
  },
});
