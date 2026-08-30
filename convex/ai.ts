"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal, components } from "./_generated/api";
import OpenAI from "openai";
import { AgentMail } from "@agentmail/convex";

// Lazy construction: Convex analyzes/bundles every module at push time, and
// the OpenAI client throws immediately in its constructor if the API key is
// missing. Building it inside each handler means a missing key only fails
// the function that actually needs it, not the entire deploy.
function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const agentmail = new AgentMail(components.agentmail);
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

const CATEGORY_LABEL: Record<string, string> = {
  jobs: "Jobs",
  flats: "Flats",
  newsletter: "Newsletters",
  other: "Other",
};

export const extractAndScore = internalAction({
  args: { listingId: v.id("listings") },
  handler: async (ctx, { listingId }) => {
    const listing = await ctx.runQuery(internal.listings.getListing, { listingId });
    if (!listing || !listing.rawMarkdown) return;

    const email = await ctx.runQuery(internal.emails.getEmail, { emailId: listing.emailId });
    const preferenceNote = email?.preferenceNote ?? "No stated preferences.";

    try {
      const openai = getOpenAI();
      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: "system",
            content:
              "You extract structured fields from a scraped listing page (apartment, job, or event) and score how well it matches the user's stated preferences. Respond with strict JSON only, no markdown fences.",
          },
          {
            role: "user",
            content: `User preferences: ${preferenceNote}

Listing content (markdown, may be truncated):
${listing.rawMarkdown.slice(0, 12000)}

Respond with JSON matching exactly this shape:
{"title": string, "price": string, "bedrooms": string, "location": string, "summary": string, "score": number, "scoreReason": string, "category": "jobs" | "flats" | "newsletter" | "other"}

- "summary": one or two factual sentences about the listing.
- "score": 0-100, how well this matches the stated preferences (100 = perfect match). If there are no stated preferences, score general desirability/completeness of the listing instead.
- "scoreReason": one sentence explaining the score.
- "category": "jobs" for a job posting/career page, "flats" for a rental/apartment/housing listing, "newsletter" for a digest/roundup/article page, "other" for anything else.
- Use "unknown" for any string field you can't find in the content.`,
          },
        ],
        response_format: { type: "json_object" },
      });

      const raw = completion.choices[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(raw);
      const ALLOWED_CATEGORIES = ["jobs", "flats", "newsletter", "other"];
      const category = ALLOWED_CATEGORIES.includes(parsed.category) ? parsed.category : "other";

      await ctx.runMutation(internal.listings.saveExtraction, {
        listingId,
        fields: {
          title: typeof parsed.title === "string" ? parsed.title : undefined,
          price: typeof parsed.price === "string" ? parsed.price : undefined,
          bedrooms: typeof parsed.bedrooms === "string" ? parsed.bedrooms : undefined,
          location: typeof parsed.location === "string" ? parsed.location : undefined,
          summary: typeof parsed.summary === "string" ? parsed.summary : undefined,
        },
        score: typeof parsed.score === "number" ? parsed.score : 0,
        scoreReason: typeof parsed.scoreReason === "string" ? parsed.scoreReason : undefined,
        category,
      });
    } catch (err) {
      await ctx.runMutation(internal.listings.saveScrapeFailure, {
        listingId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
});

// Fired by the debounced schedule in convex/digest.ts — batches everything
// one forwarder (ownerEmail) has sent since their last digest into one
// reply, sent in whichever of their threads was forwarded most recently.
// Runs as a scheduled function with no signed-in user, so ownerEmail (baked
// in when this was scheduled) is how it knows whose batch to process.
export const sendDigest = internalAction({
  args: { ownerEmail: v.string() },
  handler: async (ctx, { ownerEmail }) => {
    const allPending = await ctx.runQuery(internal.digest.pendingListings, { ownerEmail });
    const schedule = await ctx.runQuery(internal.digest.getScheduleForOwner, { ownerEmail });

    // An explicit "digest now" always gets a reply in its own thread, even
    // with nothing pending — otherwise the request silently no-ops, which
    // reads as a bug to whoever sent it.
    const requestedEmail = schedule?.requestedByEmailId
      ? await ctx.runQuery(internal.emails.getEmail, { emailId: schedule.requestedByEmailId })
      : null;

    // "jobs now" / "flats now" scopes this send to one category, leaving
    // the rest pending — the safety-net cron (or the next forward) will
    // pick those up in a later batch, uncategorized sends are unaffected.
    const category = schedule?.requestedCategory;
    const pending = category
      ? allPending.filter((row) => (row.listing.category ?? "other") === category)
      : allPending;

    if (pending.length === 0) {
      if (requestedEmail) {
        const scope = category ? `pending ${CATEGORY_LABEL[category]} listings` : "anything pending";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await agentmail.replyToMessage(ctx as any, requestedEmail.inboxId, requestedEmail.agentmailMessageId, {
          text: `You don't have any ${scope} right now. Forward a listing link (with your preferences) to get started — I'll batch everything you send and reply once things settle, or reply with "now" any time to flush immediately.`,
        });
      }
      await ctx.runMutation(internal.digest.finishSchedule, { ownerEmail });
      return;
    }

    const target = requestedEmail
      ? { email: requestedEmail }
      : pending.reduce((latest, row) => (row.email.receivedAt > latest.email.receivedAt ? row : latest));

    const preferenceNotes = Array.from(
      new Set(pending.map((row) => row.email.preferenceNote).filter((n): n is string => !!n)),
    );

    const ranked = pending
      .filter((row) => row.listing.status === "ranked")
      .sort((a, b) => (b.listing.score ?? 0) - (a.listing.score ?? 0));

    let digestText: string;
    if (ranked.length === 0) {
      digestText =
        "None of the listings you sent could be processed. Try forwarding the links again, or check that the pages are publicly accessible.";
    } else {
      const categories = Array.from(new Set(ranked.map((r) => r.listing.category ?? "other")));
      const grouped = categories.length > 1;

      const formatListing = ({ listing: l }: (typeof ranked)[number], i: number) => {
        const f = l.fields;
        return `${i + 1}. ${f?.title ?? l.url} — score ${l.score}/100
   ${[f?.price, f?.bedrooms, f?.location].filter(Boolean).join(" · ")}
   ${l.scoreReason ?? ""}
   ${l.url}`;
      };

      const listingLines = grouped
        ? categories
            .map((cat) => {
              const rows = ranked.filter((r) => (r.listing.category ?? "other") === cat);
              return `## ${CATEGORY_LABEL[cat]}\n${rows.map(formatListing).join("\n\n")}`;
            })
            .join("\n\n")
        : ranked.map(formatListing).join("\n\n");

      const openai = getOpenAI();
      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: "system",
            content:
              "You write short, friendly digest emails ranking listings for a user based on how well they match their stated preferences. Plain text only, ready to send as an email body — no markdown formatting.",
          },
          {
            role: "user",
            content: `User preferences: ${preferenceNotes.join(" | ") || "none stated"}

Ranked listings, best match first${grouped ? ", grouped by category with ## headers" : ""}:
${listingLines}

Write a short digest email: a 1-2 sentence intro, then the ranked list${grouped ? " (keep the category section headers, one per group)" : " (one line each is fine)"}, then a brief sign-off. Keep every listing URL intact and exactly as given.`,
          },
        ],
      });
      digestText = completion.choices[0]?.message?.content ?? listingLines;
    }

    // @agentmail/convex's RunMutationCtx type predates Convex's optional
    // `transactionLimits` runMutation overload; the extra param is additive
    // and backward-compatible at runtime, so this cast is safe.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await agentmail.replyToMessage(ctx as any, target.email.inboxId, target.email.agentmailMessageId, {
      text: digestText,
    });

    const listingIds = pending.map((row) => row.listing._id);
    await ctx.runMutation(internal.digest.markDigested, { listingIds });
    await ctx.runMutation(internal.digest.finishSchedule, { ownerEmail });
    await ctx.runMutation(internal.emails.saveDigest, {
      agentmailThreadId: target.email.agentmailThreadId,
      listingIds,
      body: digestText,
      listingCount: ranked.length,
    });
  },
});
