import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { leadTypeValidator, leadStatusValidator } from "./schema";
import { requireOwnedBusiness } from "./businesses";
import type { Doc } from "./_generated/dataModel";

// The dashboard's main data: every lead for one of my businesses, each
// joined with its outreach row (draft/sent/reply state). Live via useQuery.
export const list = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, { businessId }) => {
    await requireOwnedBusiness(ctx, businessId);
    const leads = await ctx.db
      .query("leads")
      .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
      .order("desc")
      .take(300);

    const rows: { lead: Doc<"leads">; outreach: Doc<"outreach"> | null }[] = [];
    for (const lead of leads) {
      const outreach = await ctx.db
        .query("outreach")
        .withIndex("by_leadId", (q) => q.eq("leadId", lead._id))
        .first();
      rows.push({ lead, outreach });
    }
    return rows;
  },
});

async function approveLead(
  ctx: MutationCtx,
  lead: Doc<"leads">,
  outreach: Doc<"outreach"> | null,
) {
  if (!outreach || outreach.draftStatus !== "ready" || outreach.sentAt !== undefined) {
    throw new Error("No sendable draft for this lead");
  }
  if (!lead.contactEmail) throw new Error("No contact email for this lead");
  if (lead.status !== "sourced" && lead.status !== "approved") {
    throw new Error("Lead is not awaiting approval");
  }
  await ctx.db.patch(lead._id, { status: "approved" });
  await ctx.db.insert("activity", {
    businessId: lead.businessId,
    leadId: lead._id,
    kind: "sent",
    message: `Outreach to ${lead.name} approved — sending…`,
  });
  await ctx.scheduler.runAfter(0, internal.pipeline.sendOutreach, { outreachId: outreach._id });
}

// Approve a single lead's outreach (the card's primary action).
export const approve = mutation({
  args: { leadId: v.id("leads") },
  handler: async (ctx, { leadId }) => {
    const lead = await ctx.db.get(leadId);
    if (!lead) throw new Error("Lead not found");
    await requireOwnedBusiness(ctx, lead.businessId);
    const outreach = await ctx.db
      .query("outreach")
      .withIndex("by_leadId", (q) => q.eq("leadId", leadId))
      .first();
    await approveLead(ctx, lead, outreach);
  },
});

// Batch approve — "approve all pending drafts" for one business.
export const approveAll = mutation({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, { businessId }) => {
    await requireOwnedBusiness(ctx, businessId);
    const leads = await ctx.db
      .query("leads")
      .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
      .take(300);
    let approved = 0;
    for (const lead of leads) {
      if (lead.status !== "sourced" || !lead.contactEmail) continue;
      const outreach = await ctx.db
        .query("outreach")
        .withIndex("by_leadId", (q) => q.eq("leadId", lead._id))
        .first();
      if (!outreach || outreach.draftStatus !== "ready" || outreach.sentAt !== undefined) continue;
      await approveLead(ctx, lead, outreach);
      approved += 1;
      if (approved >= 25) break;
    }
    return approved;
  },
});

export const skip = mutation({
  args: { leadId: v.id("leads") },
  handler: async (ctx, { leadId }) => {
    const lead = await ctx.db.get(leadId);
    if (!lead) throw new Error("Lead not found");
    await requireOwnedBusiness(ctx, lead.businessId);
    await ctx.db.patch(leadId, { status: "skipped" });
  },
});

export const markWon = mutation({
  args: { leadId: v.id("leads") },
  handler: async (ctx, { leadId }) => {
    const lead = await ctx.db.get(leadId);
    if (!lead) throw new Error("Lead not found");
    await requireOwnedBusiness(ctx, lead.businessId);
    await ctx.db.patch(leadId, { status: "won" });
    await ctx.db.insert("activity", {
      businessId: lead.businessId,
      leadId,
      kind: "system",
      message: `${lead.name} marked as won 🎉`,
    });
  },
});

// ---- internal (pipeline) ----

export const get = internalQuery({
  args: { leadId: v.id("leads") },
  handler: (ctx, { leadId }) => ctx.db.get(leadId),
});

export const byPlace = internalQuery({
  args: { businessId: v.id("businesses"), placeId: v.string() },
  handler: (ctx, { businessId, placeId }) =>
    ctx.db
      .query("leads")
      .withIndex("by_businessId_and_placeId", (q) =>
        q.eq("businessId", businessId).eq("placeId", placeId),
      )
      .first(),
});

// Insert a judged lead. Dedupes on placeId (places) or url (events) so
// rescans only surface genuinely new leads. Returns null on dupe.
export const saveSourced = internalMutation({
  args: {
    businessId: v.id("businesses"),
    type: leadTypeValidator,
    name: v.string(),
    address: v.optional(v.string()),
    url: v.optional(v.string()),
    placeId: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    relevanceNote: v.optional(v.string()),
    evidence: v.optional(v.string()),
    score: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.placeId) {
      const existing = await ctx.db
        .query("leads")
        .withIndex("by_businessId_and_placeId", (q) =>
          q.eq("businessId", args.businessId).eq("placeId", args.placeId),
        )
        .first();
      if (existing) return null;
    } else if (args.url) {
      const existing = await ctx.db
        .query("leads")
        .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
        .collect();
      if (existing.some((l) => l.url === args.url)) return null;
    }

    const leadId = await ctx.db.insert("leads", { ...args, status: "sourced" });
    await ctx.db.insert("activity", {
      businessId: args.businessId,
      leadId,
      kind: "sourcing",
      message: `Sourced ${args.name} (${args.type})${args.relevanceNote ? ` — ${args.relevanceNote}` : ""}`,
    });
    return leadId;
  },
});

export const setStatus = internalMutation({
  args: { leadId: v.id("leads"), status: leadStatusValidator },
  handler: (ctx, { leadId, status }) => ctx.db.patch(leadId, { status }),
});
