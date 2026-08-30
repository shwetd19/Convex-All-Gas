import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";

export const getEmail = internalQuery({
  args: { emailId: v.id("emails") },
  handler: (ctx, { emailId }) => ctx.db.get(emailId),
});

export const saveDigest = internalMutation({
  args: {
    agentmailThreadId: v.string(),
    listingIds: v.array(v.id("listings")),
    body: v.string(),
    listingCount: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("digests", {
      agentmailThreadId: args.agentmailThreadId,
      listingIds: args.listingIds,
      body: args.body,
      listingCount: args.listingCount,
      sentAt: Date.now(),
    });
  },
});

export const listRecent = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("emails").order("desc").take(20);
  },
});
