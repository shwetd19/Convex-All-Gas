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

// One business per account (v1). All public functions derive the business
// from the signed-in user — never from a client-supplied id.
export async function requireBusiness(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not signed in");
  const business = await ctx.db
    .query("businesses")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();
  if (!business) throw new Error("No business set up yet");
  return business;
}

// Onboarding step 1: "Paste your business URL". Re-running replaces the
// profile on the same row (a fresh intake), keeping existing leads —
// sourcing dedupes by placeId anyway.
export const create = mutation({
  args: { url: v.string() },
  handler: async (ctx, { url }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");
    const trimmed = url.trim();
    if (!trimmed) throw new Error("Enter your business URL");
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

    const existing = await ctx.db
      .query("businesses")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    let businessId;
    if (existing) {
      await ctx.db.patch(existing._id, {
        url: normalized,
        status: "scraping",
        error: undefined,
        name: undefined,
        description: undefined,
        offerings: undefined,
        category: undefined,
        address: undefined,
        placeId: undefined,
        lat: undefined,
        lng: undefined,
      });
      businessId = existing._id;
    } else {
      businessId = await ctx.db.insert("businesses", {
        userId,
        url: normalized,
        status: "scraping",
        approvalMode: "approve_each",
        followUpDelayDays: 4,
        weeklyRescan: true,
      });
    }
    await ctx.scheduler.runAfter(0, internal.pipeline.intakeBusiness, { businessId });
    return businessId;
  },
});

// The signed-in user's business, or null (signed out / not created yet).
export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db
      .query("businesses")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
  },
});

// Onboarding step 3 → 4: "Is this you?" → kick off the sourcing pipeline.
export const confirm = mutation({
  args: {},
  handler: async (ctx) => {
    const business = await requireBusiness(ctx);
    if (business.status !== "confirm") throw new Error("Nothing to confirm");
    await ctx.db.patch(business._id, { status: "sourcing" });
    await ctx.scheduler.runAfter(0, internal.pipeline.sourceLeads, {
      businessId: business._id,
      rescan: false,
    });
  },
});

// "Not me — start over": wipe this business and everything under it.
export const reset = mutation({
  args: {},
  handler: async (ctx) => {
    const business = await requireBusiness(ctx);
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

export const updateSettings = mutation({
  args: {
    approvalMode: v.optional(v.union(v.literal("approve_each"), v.literal("auto_send"))),
    followUpDelayDays: v.optional(v.number()),
    weeklyRescan: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const business = await requireBusiness(ctx);
    const patch: Record<string, unknown> = {};
    if (args.approvalMode !== undefined) patch.approvalMode = args.approvalMode;
    if (args.followUpDelayDays !== undefined) {
      patch.followUpDelayDays = Math.min(30, Math.max(1, Math.round(args.followUpDelayDays)));
    }
    if (args.weeklyRescan !== undefined) patch.weeklyRescan = args.weeklyRescan;
    await ctx.db.patch(business._id, patch);
  },
});

// Manual "rescan now" — same pipeline the weekly cron kicks off.
export const rescanNow = mutation({
  args: {},
  handler: async (ctx) => {
    const business = await requireBusiness(ctx);
    if (business.status !== "ready") throw new Error("Finish setup first");
    await ctx.db.insert("activity", {
      businessId: business._id,
      kind: "system",
      message: "Manual rescan started — checking for new nearby leads…",
    });
    await ctx.scheduler.runAfter(0, internal.pipeline.sourceLeads, {
      businessId: business._id,
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

export const markScanned = internalMutation({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, { businessId }) => {
    await ctx.db.patch(businessId, { status: "ready", lastScanAt: Date.now() });
  },
});
