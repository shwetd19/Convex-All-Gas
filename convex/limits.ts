import { internalQuery, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

// Free-tier account caps. Past these, the account holder contacts the org.
// (The shared demo workspace is excluded from both counts.)
export const MAX_BUSINESSES = 3;
export const MAX_OUTREACH_EMAILS = 20;
export const LIMIT_CONTACT_EMAIL = "shwetasdhake16@gmail.com";

export const businessLimitMessage = `You've reached the free limit of ${MAX_BUSINESSES} businesses per account. For more, contact the organization at ${LIMIT_CONTACT_EMAIL}.`;
export const emailLimitMessage = `You've reached the free limit of ${MAX_OUTREACH_EMAILS} outreach emails per account. For more, contact the organization at ${LIMIT_CONTACT_EMAIL}.`;

// The user's own (non-demo) businesses.
async function ownBusinesses(ctx: QueryCtx, userId: Id<"users">) {
  const all = await ctx.db
    .query("businesses")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  return all.filter((b) => !b.isDemo);
}

export async function countOwnBusinesses(ctx: QueryCtx, userId: Id<"users">) {
  return (await ownBusinesses(ctx, userId)).length;
}

// Count of initial outreach emails already sent across all the user's
// businesses — the metered unit for the per-account email cap.
export async function countSentOutreachForUser(ctx: QueryCtx, userId: Id<"users">) {
  const businesses = await ownBusinesses(ctx, userId);
  let sent = 0;
  for (const biz of businesses) {
    const rows = await ctx.db
      .query("outreach")
      .withIndex("by_businessId", (q) => q.eq("businessId", biz._id))
      .collect();
    sent += rows.filter((o) => o.sentAt !== undefined).length;
  }
  return sent;
}

// Backstop for internal send actions (auto-send path): given the business
// being sent from, how many outreach emails its owner has already sent.
export const sentCountForBusinessOwner = internalQuery({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, { businessId }) => {
    const business = await ctx.db.get(businessId);
    if (!business) return { count: 0, cap: MAX_OUTREACH_EMAILS };
    const count = await countSentOutreachForUser(ctx, business.userId);
    return { count, cap: MAX_OUTREACH_EMAILS };
  },
});
