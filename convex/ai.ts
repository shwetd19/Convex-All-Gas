"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal, components } from "./_generated/api";
import OpenAI from "openai";
import { AgentMail } from "@agentmail/convex";
import { extractReplyText, parseFeedback, type ParsedFeedback } from "./lib/extractUrls";
import { extractEmailAddress } from "./lib/parseFrom";

const APP_NAME = "Sift";
const STEER_FOOTER = `—
Reply to steer the next one: "skip #2", "more like #3", "less like #1".
Reply "now" any time to get everything pending right away.
${APP_NAME}`;

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

    // Past steering from this forwarder's digest replies. Skips are hard
    // rules on the same URL, soft signals on similar ones; more/less nudge
    // the score for lookalikes (same source, similar role/place/price).
    const feedback = email
      ? await ctx.runQuery(internal.feedback.forOwner, {
          ownerEmail: extractEmailAddress(email.from),
        })
      : [];
    const skippedUrls = new Set(feedback.filter((f) => f.kind === "skip").map((f) => f.url));
    const feedbackLines = feedback
      .map((f) => {
        const label = f.kind === "skip" ? "SKIP (score 0-15)" : f.kind === "more" ? "MORE LIKE THIS (+15-25)" : "LESS LIKE THIS (-15-25)";
        return `- ${label}: "${f.title ?? f.url}" from ${f.domain}${f.summary ? ` — ${f.summary}` : ""}`;
      })
      .join("\n");

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
${
  feedbackLines
    ? `
The user has reacted to earlier listings. Apply these to the score when this listing resembles one of them (same source domain, same employer/property, same role or area, similar price):
${feedbackLines}
${skippedUrls.has(listing.url) ? "\nThis exact URL was previously skipped by the user. Score it 0-10." : ""}`
    : ""
}

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
    let rankedListingIds: (typeof ranked)[number]["listing"]["_id"][] = [];
    if (ranked.length === 0) {
      digestText =
        "None of the listings you sent could be processed. Try forwarding the links again, or check that the pages are publicly accessible.";
    } else {
      const categories = Array.from(new Set(ranked.map((r) => r.listing.category ?? "other")));
      const grouped = categories.length > 1;

      // Numbering runs continuously across category groups (not restarting
      // per group) so "skip #4" in a reply is unambiguous. rankedOrder is
      // the same sequence, saved on the digest for resolving those replies.
      const rankedOrder = grouped
        ? categories.flatMap((cat) => ranked.filter((r) => (r.listing.category ?? "other") === cat))
        : ranked;
      const numberOf = new Map(rankedOrder.map((r, i) => [r.listing._id, i + 1]));

      const formatListing = ({ listing: l }: (typeof ranked)[number]) => {
        const f = l.fields;
        return `${numberOf.get(l._id)}. ${f?.title ?? l.url} — score ${l.score}/100
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
      rankedListingIds = rankedOrder.map((r) => r.listing._id);

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

Write a short digest email: a 1-2 sentence intro, then the ranked list${grouped ? " (keep the category section headers, one per group)" : ""}, then stop — no sign-off, no subject line. Keep every listing's number, title, score, and URL exactly as given; the numbers are how the user refers back to items.`,
          },
        ],
      });
      digestText = (completion.choices[0]?.message?.content ?? listingLines).trim();
    }
    digestText = `${digestText}\n\n${STEER_FOOTER}`;

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
      rankedListingIds,
      body: digestText,
      listingCount: ranked.length,
    });
  },
});

// A reply in a digest thread. Cheap regex parse first ("skip #2"); if that
// finds nothing, one small OpenAI call maps free text ("the Bentley one is
// too senior") onto the numbered list. Every parsed item becomes a feedback
// row that extractAndScore reads for this user's future listings, and the
// user gets a one-line confirmation in the same thread so the loop closes.
export const handleFeedbackReply = internalAction({
  args: { emailId: v.id("emails"), digestId: v.id("digests"), text: v.string() },
  handler: async (ctx, { emailId, digestId, text }) => {
    const email = await ctx.runQuery(internal.emails.getEmail, { emailId });
    const digest = await ctx.runQuery(internal.emails.getDigest, { digestId });
    if (!email || !digest) return;
    const ownerEmail = extractEmailAddress(email.from);
    const replyText = extractReplyText(text);
    const ranked = digest.rankedListingIds ?? [];

    const reply = (body: string) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      agentmail.replyToMessage(ctx as any, email.inboxId, email.agentmailMessageId, {
        text: `${body}\n\n— ${APP_NAME}`,
      });

    // "now" / "digest" in a reply is still the flush command.
    if (/\b(now|digest)\b/i.test(replyText) && parseFeedback(replyText).length === 0) {
      await ctx.runMutation(internal.digest.scheduleDigest, {
        ownerEmail,
        immediate: true,
        requestedByEmailId: emailId,
      });
      return;
    }

    let parsed: ParsedFeedback[] = parseFeedback(replyText);

    if (parsed.length === 0 && replyText.length > 0 && ranked.length > 0) {
      const titles: string[] = [];
      for (let i = 0; i < ranked.length; i++) {
        const l = await ctx.runQuery(internal.listings.getListing, { listingId: ranked[i] });
        titles.push(`${i + 1}. ${l?.fields?.title ?? l?.url ?? "(unknown)"}`);
      }
      const openai = getOpenAI();
      const completion = await openai.chat.completions.create({
        model: MODEL,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'The user replied to a numbered digest of listings. Map their reply onto the list. Respond with JSON: {"items":[{"kind":"skip"|"more"|"less","index":<1-based number>}]}. "skip" = they don\'t want this one or ones like it; "more" = they want more like it; "less" = fewer like it. Return {"items":[]} if the reply is not feedback about specific listings.',
          },
          { role: "user", content: `Digest:\n${titles.join("\n")}\n\nReply:\n${replyText}` },
        ],
      });
      try {
        const out = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
        const kinds = new Set(["skip", "more", "less"]);
        parsed = (Array.isArray(out.items) ? out.items : [])
          .filter((it: { kind: string; index: number }) => kinds.has(it.kind) && Number.isInteger(it.index))
          .map((it: { kind: ParsedFeedback["kind"]; index: number }) => ({ kind: it.kind, index: it.index }));
      } catch {
        parsed = [];
      }
    }

    const applied: string[] = [];
    const outOfRange: number[] = [];
    for (const { kind, index } of parsed) {
      const listingId = ranked[index - 1];
      if (!listingId) {
        outOfRange.push(index);
        continue;
      }
      const result = await ctx.runMutation(internal.feedback.record, {
        ownerEmail,
        kind,
        listingId,
        digestId,
      });
      if (!result) continue;
      const verb =
        kind === "skip"
          ? "Skipping listings like"
          : kind === "more"
            ? "Looking for more like"
            : "Showing fewer like";
      applied.push(`${verb} #${index} (${result.title}, ${result.domain}).`);
    }

    if (applied.length === 0) {
      const hint =
        outOfRange.length > 0
          ? `That digest only had ${ranked.length} listing${ranked.length === 1 ? "" : "s"}, so #${outOfRange[0]} didn't match anything.`
          : "I couldn't tell which listing you meant.";
      await reply(`${hint} Reply with the number, like "skip #2" or "more like #3", and I'll factor it into the next digest.`);
      return;
    }

    await reply(`Got it.\n${applied.join("\n")}\nThe next digest will be ranked with this in mind.`);
  },
});
