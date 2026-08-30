import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

const kindValidator = v.union(v.literal("skip"), v.literal("more"), v.literal("less"));

// Records one steering signal from a digest reply. Idempotent per
// (owner, listing): replying "skip #2" twice, or changing your mind to
// "more like #2", updates the one row instead of stacking contradictions.
export const record = internalMutation({
  args: {
    ownerEmail: v.string(),
    kind: kindValidator,
    listingId: v.id("listings"),
    digestId: v.id("digests"),
  },
  handler: async (ctx, { ownerEmail, kind, listingId, digestId }) => {
    const listing = await ctx.db.get(listingId);
    if (!listing) return null;
    let domain = "";
    try {
      domain = new URL(listing.url).hostname.replace(/^www\./, "");
    } catch {
      domain = listing.url;
    }
    const existing = (
      await ctx.db
        .query("feedback")
        .withIndex("by_owner", (q) => q.eq("ownerEmail", ownerEmail))
        .collect()
    ).find((f) => f.listingId === listingId);

    const row = {
      ownerEmail,
      kind,
      listingId,
      url: listing.url,
      domain,
      title: listing.fields?.title,
      summary: listing.fields?.summary,
      digestId,
      createdAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, row);
    } else {
      await ctx.db.insert("feedback", row);
    }
    return { title: listing.fields?.title ?? listing.url, domain };
  },
});

// Everything this owner has said, newest first — fed into the scoring
// prompt for their future listings.
export const forOwner = internalQuery({
  args: { ownerEmail: v.string() },
  handler: async (ctx, { ownerEmail }) => {
    const rows = await ctx.db
      .query("feedback")
      .withIndex("by_owner", (q) => q.eq("ownerEmail", ownerEmail))
      .collect();
    return rows.sort((a, b) => b.createdAt - a.createdAt).slice(0, 25);
  },
});

// Dashboard: the signed-in user's steering list.
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user?.email) return null;
    const rows = await ctx.db
      .query("feedback")
      .withIndex("by_owner", (q) => q.eq("ownerEmail", user.email!.toLowerCase()))
      .collect();
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const remove = mutation({
  args: { feedbackId: v.id("feedback") },
  handler: async (ctx, { feedbackId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");
    const user = await ctx.db.get(userId);
    const row = await ctx.db.get(feedbackId);
    if (!row || !user?.email || row.ownerEmail !== user.email.toLowerCase()) {
      throw new Error("Not yours");
    }
    await ctx.db.delete(feedbackId);
  },
});
