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
{"title": string, "price": string, "bedrooms": string, "location": string, "summary": string, "score": number, "scoreReason": string}

- "summary": one or two factual sentences about the listing.
- "score": 0-100, how well this matches the stated preferences (100 = perfect match). If there are no stated preferences, score general desirability/completeness of the listing instead.
- "scoreReason": one sentence explaining the score.
- Use "unknown" for any field you can't find in the content.`,
          },
        ],
        response_format: { type: "json_object" },
      });

      const raw = completion.choices[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(raw);

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
      });
    } catch (err) {
      await ctx.runMutation(internal.listings.saveScrapeFailure, {
        listingId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    await ctx.runAction(internal.ai.maybeSendDigest, { emailId: listing.emailId });
  },
});

export const maybeSendDigest = internalAction({
  args: { emailId: v.id("emails") },
  handler: async (ctx, { emailId }) => {
    const listings = await ctx.runQuery(internal.listings.listForEmailInternal, { emailId });
    if (listings.length === 0) return;

    const settled = listings.every((l) => l.status === "ranked" || l.status === "failed");
    if (!settled) return;

    const claimed = await ctx.runMutation(internal.emails.claimDigestSend, { emailId });
    if (!claimed) return;

    const email = await ctx.runQuery(internal.emails.getEmail, { emailId });
    if (!email) return;

    const ranked = listings
      .filter((l) => l.status === "ranked")
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    let digestText: string;
    if (ranked.length === 0) {
      digestText =
        "None of the listings you sent could be processed. Try forwarding the links again, or check that the pages are publicly accessible.";
    } else {
      const listingLines = ranked
        .map((l, i) => {
          const f = l.fields;
          return `${i + 1}. ${f?.title ?? l.url} — score ${l.score}/100
   ${[f?.price, f?.bedrooms, f?.location].filter(Boolean).join(" · ")}
   ${l.scoreReason ?? ""}
   ${l.url}`;
        })
        .join("\n\n");

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
            content: `User preferences: ${email.preferenceNote ?? "none stated"}

Ranked listings, best match first:
${listingLines}

Write a short digest email: a 1-2 sentence intro, then the ranked list (one line each is fine), then a brief sign-off. Keep every listing URL intact and exactly as given.`,
          },
        ],
      });
      digestText = completion.choices[0]?.message?.content ?? listingLines;
    }

    // @agentmail/convex's RunMutationCtx type predates Convex's optional
    // `transactionLimits` runMutation overload; the extra param is additive
    // and backward-compatible at runtime, so this cast is safe.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await agentmail.replyToMessage(ctx as any, email.inboxId, email.agentmailMessageId, {
      text: digestText,
    });

    await ctx.runMutation(internal.emails.saveDigest, {
      emailId,
      agentmailThreadId: email.agentmailThreadId,
      body: digestText,
      listingCount: ranked.length,
    });
  },
});
