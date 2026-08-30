import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { internal, components } from "./_generated/api";
import { FirecrawlClient } from "@firecrawl/firecrawl-convex";
import { categoryValidator } from "./schema";

const firecrawl = new FirecrawlClient(components.firecrawl);

const statusValidator = v.union(
  v.literal("pending"),
  v.literal("scraping"),
  v.literal("scraped"),
  v.literal("ranked"),
  v.literal("failed"),
);

export const listForEmail = query({
  args: { emailId: v.id("emails") },
  handler: async (ctx, { emailId }) =>
    ctx.db
      .query("listings")
      .withIndex("by_email", (q) => q.eq("emailId", emailId))
      .collect(),
});

export const getListing = internalQuery({
  args: { listingId: v.id("listings") },
  handler: (ctx, { listingId }) => ctx.db.get(listingId),
});

export const listForEmailInternal = internalQuery({
  args: { emailId: v.id("emails") },
  handler: async (ctx, { emailId }) =>
    ctx.db
      .query("listings")
      .withIndex("by_email", (q) => q.eq("emailId", emailId))
      .collect(),
});

export const setStatus = internalMutation({
  args: { listingId: v.id("listings"), status: statusValidator },
  handler: (ctx, { listingId, status }) => ctx.db.patch(listingId, { status }),
});

export const saveScrape = internalMutation({
  args: { listingId: v.id("listings"), rawMarkdown: v.string() },
  handler: (ctx, { listingId, rawMarkdown }) =>
    ctx.db.patch(listingId, { rawMarkdown, status: "scraped" }),
});

export const saveScrapeFailure = internalMutation({
  args: { listingId: v.id("listings"), error: v.string() },
  handler: (ctx, { listingId, error }) => ctx.db.patch(listingId, { status: "failed", error }),
});

export const saveExtraction = internalMutation({
  args: {
    listingId: v.id("listings"),
    fields: v.object({
      title: v.optional(v.string()),
      price: v.optional(v.string()),
      bedrooms: v.optional(v.string()),
      location: v.optional(v.string()),
      summary: v.optional(v.string()),
    }),
    score: v.number(),
    scoreReason: v.optional(v.string()),
    category: categoryValidator,
  },
  handler: (ctx, { listingId, fields, score, scoreReason, category }) =>
    ctx.db.patch(listingId, { fields, score, scoreReason, category, status: "ranked" }),
});

export const scrapeListing = internalAction({
  args: { listingId: v.id("listings") },
  handler: async (ctx, { listingId }) => {
    const listing = await ctx.runQuery(internal.listings.getListing, { listingId });
    if (!listing) return;

    await ctx.runMutation(internal.listings.setStatus, { listingId, status: "scraping" });

    try {
      const page: any = await firecrawl.scrape(ctx, listing.url, {
        formats: ["markdown"],
        onlyMainContent: true,
      });
      const markdown: string = page?.markdown ?? "";
      if (!markdown) throw new Error("Firecrawl returned no markdown content");

      await ctx.runMutation(internal.listings.saveScrape, { listingId, rawMarkdown: markdown });
      await ctx.runAction(internal.ai.extractAndScore, { listingId });
    } catch (err) {
      await ctx.runMutation(internal.listings.saveScrapeFailure, {
        listingId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
});
