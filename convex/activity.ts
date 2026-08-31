import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

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

// Reverse-chronological feed for the signed-in user's business.
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const business = await ctx.db
      .query("businesses")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (!business) return null;
    return await ctx.db
      .query("activity")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .order("desc")
      .take(100);
  },
});
