import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";

export const getEmail = internalQuery({
  args: { emailId: v.id("emails") },
  handler: (ctx, { emailId }) => ctx.db.get(emailId),
});

// Atomically claims the right to send a digest for this email, so two
// listings finishing extraction at the same moment can't both send one.
// digestSentAt is set to -1 as a "claimed, sending" sentinel, then to the
// real timestamp once the send completes.
export const claimDigestSend = internalMutation({
  args: { emailId: v.id("emails") },
  handler: async (ctx, { emailId }) => {
    const email = await ctx.db.get(emailId);
    if (!email || email.digestSentAt !== undefined) return false;
    await ctx.db.patch(emailId, { digestSentAt: -1 });
    return true;
  },
});

export const saveDigest = internalMutation({
  args: {
    emailId: v.id("emails"),
    agentmailThreadId: v.string(),
    body: v.string(),
    listingCount: v.number(),
  },
  handler: async (ctx, args) => {
    const sentAt = Date.now();
    await ctx.db.patch(args.emailId, { digestSentAt: sentAt });
    await ctx.db.insert("digests", {
      emailId: args.emailId,
      agentmailThreadId: args.agentmailThreadId,
      body: args.body,
      listingCount: args.listingCount,
      sentAt,
    });
  },
});

export const listRecent = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("emails").order("desc").take(20);
  },
});
