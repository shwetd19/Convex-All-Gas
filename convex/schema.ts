import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const categoryValidator = v.union(
  v.literal("jobs"),
  v.literal("flats"),
  v.literal("newsletter"),
  v.literal("other"),
);

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
    // Set once this listing has been included in a sent digest — replaces
    // the old per-email digestSentAt now that digests batch across emails.
    digestedAt: v.optional(v.number()),
    // LLM-classified during extraction; used to group the digest and to
    // scope a "jobs now" / "flats now" immediate request to one category.
    category: v.optional(categoryValidator),
  })
    .index("by_email", ["emailId"])
    .index("by_status", ["status"]),

  // One digest can cover listings pulled in from several forwarded emails
  // (see convex/digest.ts), so it references listings directly rather than
  // a single parent email.
  digests: defineTable({
    agentmailThreadId: v.string(),
    listingIds: v.array(v.id("listings")),
    body: v.string(),
    listingCount: v.number(),
    sentAt: v.number(),
  }),

  // Singleton row (one inbox for the whole app) tracking the debounced
  // digest send: every new forward pushes the scheduled send time out:
  // convex/digest.ts's scheduleDigest cancels scheduledFunctionId and
  // reschedules, so a burst of forwards only ever fires one send.
  digestSchedule: defineTable({
    scheduledFunctionId: v.optional(v.id("_scheduled_functions")),
    scheduledFor: v.optional(v.number()),
    lastDigestAt: v.optional(v.number()),
    // Set only on an explicit "digest now" request — sendDigest replies to
    // this email specifically, even with nothing else pending.
    requestedByEmailId: v.optional(v.id("emails")),
    // Set only when the "now" request named a category ("jobs now") —
    // scopes that immediate send to just this category.
    requestedCategory: v.optional(categoryValidator),
  }),
});
