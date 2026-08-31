import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export const leadTypeValidator = v.union(
  v.literal("competitor"),
  v.literal("complement"),
  v.literal("office"),
  v.literal("event"),
  // A nearby organization likely to BUY from this business (B2B prospect).
  v.literal("customer"),
);

// The lead lifecycle from PLAN.md, plus "skipped" (user said no) and "won".
export const leadStatusValidator = v.union(
  v.literal("sourced"),
  v.literal("approved"),
  v.literal("outreach_sent"),
  v.literal("replied"),
  v.literal("followed_up"),
  v.literal("cold"),
  v.literal("won"),
  v.literal("skipped"),
);

export const replyClassificationValidator = v.union(
  v.literal("interested"),
  v.literal("not_interested"),
  v.literal("needs_info"),
);

export default defineSchema({
  ...authTables,

  // Single-row cache of the app's AgentMail inbox. All outreach sends from
  // this dedicated inbox — never the user's personal one (see PLAN.md
  // guardrails). Carried over unchanged from the previous app.
  appInbox: defineTable({
    inboxId: v.string(),
    email: v.string(),
    displayName: v.optional(v.string()),
  }),

  // One business per account (v1). Holds the scraped/resolved profile and
  // the user's settings. Status drives the onboarding flow:
  // scraping → confirm ("Is this you?") → sourcing → ready.
  businesses: defineTable({
    userId: v.id("users"),
    url: v.string(),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    offerings: v.optional(v.array(v.string())),
    category: v.optional(v.string()),
    address: v.optional(v.string()),
    placeId: v.optional(v.string()),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    // Extra profile details the owner fills in on the Profile page — also
    // fed into the outreach prompts.
    teamSize: v.optional(v.string()),
    domain: v.optional(v.string()),
    foundedYear: v.optional(v.string()),
    notes: v.optional(v.string()),
    status: v.union(
      v.literal("scraping"),
      v.literal("confirm"),
      v.literal("sourcing"),
      v.literal("ready"),
      v.literal("failed"),
    ),
    error: v.optional(v.string()),
    scrapedAt: v.optional(v.number()),
    lastScanAt: v.optional(v.number()),
    // Settings (dashboard spec): approve-each is the demo-safe default.
    approvalMode: v.union(v.literal("approve_each"), v.literal("auto_send")),
    followUpDelayDays: v.number(),
    weeklyRescan: v.boolean(),
    // Agent auto-responds to inbound replies (undefined = on).
    autoReply: v.optional(v.boolean()),
  }).index("by_userId", ["userId"]),

  // One row per sourced contact — the standing job, not a one-shot.
  leads: defineTable({
    businessId: v.id("businesses"),
    type: leadTypeValidator,
    name: v.string(),
    address: v.optional(v.string()),
    url: v.optional(v.string()),
    placeId: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    relevanceNote: v.optional(v.string()),
    // The scraped snippet that justified including them — shown as
    // sourcing evidence in the lead detail view.
    evidence: v.optional(v.string()),
    score: v.optional(v.number()),
    status: leadStatusValidator,
  })
    .index("by_businessId", ["businessId"])
    .index("by_businessId_and_placeId", ["businessId", "placeId"]),

  // The outreach state machine for one lead: draft → sent → (reply |
  // follow-up → cold). nextActionAt is when the follow-up cron should act
  // (send the one follow-up, or mark cold after it) — cleared on reply.
  outreach: defineTable({
    leadId: v.id("leads"),
    businessId: v.id("businesses"),
    inboxId: v.optional(v.string()),
    subject: v.optional(v.string()),
    draftText: v.optional(v.string()),
    draftStatus: v.union(v.literal("generating"), v.literal("ready"), v.literal("failed")),
    agentmailThreadId: v.optional(v.string()),
    agentmailMessageId: v.optional(v.string()),
    sentAt: v.optional(v.number()),
    followUpSentAt: v.optional(v.number()),
    nextActionAt: v.optional(v.number()),
    lastReplyAt: v.optional(v.number()),
    replyClassification: v.optional(replyClassificationValidator),
  })
    .index("by_leadId", ["leadId"])
    .index("by_businessId", ["businessId"])
    .index("by_agentmailThreadId", ["agentmailThreadId"])
    .index("by_nextActionAt", ["nextActionAt"]),

  // Every message in a lead's thread, for the compact inbox view in the
  // lead detail — outbound initial/follow-up and inbound replies.
  messages: defineTable({
    outreachId: v.id("outreach"),
    businessId: v.id("businesses"),
    direction: v.union(v.literal("outbound"), v.literal("inbound")),
    kind: v.union(
      v.literal("initial"),
      v.literal("follow_up"),
      v.literal("reply"),
      v.literal("auto_reply"),
    ),
    subject: v.optional(v.string()),
    text: v.string(),
    from: v.optional(v.string()),
    classification: v.optional(replyClassificationValidator),
    agentmailMessageId: v.optional(v.string()),
    sentAt: v.number(),
  })
    .index("by_outreachId", ["outreachId"])
    .index("by_agentmailMessageId", ["agentmailMessageId"]),

  // Timestamped log per business — the live "watch the agent work" feed
  // (sourced → drafted → sent → replied). Ordered by _creationTime.
  activity: defineTable({
    businessId: v.id("businesses"),
    leadId: v.optional(v.id("leads")),
    kind: v.string(), // "sourcing" | "draft" | "sent" | "reply" | "follow_up" | "system"
    message: v.string(),
  }).index("by_businessId", ["businessId"]),
});
