import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { requireOwnedBusiness } from "./businesses";

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
    await requireOwnedBusiness(ctx, businessId);
    return await ctx.db
      .query("activity")
      .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
      .order("desc")
      .take(100);
  },
});
