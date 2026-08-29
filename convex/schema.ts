import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Single-row cache of the demo inbox, discovered/created via the AgentMail
  // component. Kept in our own table rather than the component's (its
  // inbox cache isn't part of the component's public typed API).
  appInbox: defineTable({
    inboxId: v.string(),
    email: v.string(),
    displayName: v.optional(v.string()),
  }),

  // One row per inbound forward we've processed. No auth for the MVP —
  // everything keyed by the inbox address that received the mail.
  emails: defineTable({
    agentmailMessageId: v.string(),
    agentmailThreadId: v.string(),
    inboxId: v.string(),
    from: v.string(),
    subject: v.optional(v.string()),
    receivedAt: v.number(),
    preferenceNote: v.optional(v.string()),
    digestSentAt: v.optional(v.number()),
  })
    .index("by_thread", ["agentmailThreadId"])
    .index("by_agentmail_message", ["agentmailMessageId"]),

  listings: defineTable({
    emailId: v.id("emails"),
    url: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("scraping"),
      v.literal("scraped"),
      v.literal("ranked"),
      v.literal("failed"),
    ),
    rawMarkdown: v.optional(v.string()),
    fields: v.optional(
      v.object({
        title: v.optional(v.string()),
        price: v.optional(v.string()),
        bedrooms: v.optional(v.string()),
        location: v.optional(v.string()),
        summary: v.optional(v.string()),
      }),
    ),
    score: v.optional(v.number()),
    scoreReason: v.optional(v.string()),
    error: v.optional(v.string()),
  })
    .index("by_email", ["emailId"])
    .index("by_status", ["status"]),

  digests: defineTable({
    emailId: v.id("emails"),
    agentmailThreadId: v.string(),
    body: v.string(),
    listingCount: v.number(),
    sentAt: v.number(),
  }).index("by_email", ["emailId"]),
});
