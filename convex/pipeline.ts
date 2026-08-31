"use node";

// The agentic pipeline (PLAN.md): Firecrawl scrapes real pages, Google
// Places grounds "what's physically nearby", OpenAI judges/drafts/classifies
// over that grounded data, AgentMail sends from the app's own inbox.
//
// Sourcing is two-tier for volume: a wide grounded candidate pool from
// several Places searches is triaged in batched LLM calls from metadata
// (fast, no scraping), every kept lead lands immediately, and the deep
// scrape (contact email + evidence + draft) runs for the top-scored leads
// inside the 5-minute scan budget.

import { v } from "convex/values";
import { internalAction, type ActionCtx } from "./_generated/server";
import { internal, components } from "./_generated/api";
import OpenAI from "openai";
import { FirecrawlClient } from "@firecrawl/firecrawl-convex";
import { agentmailApiFetch } from "./lib/agentmailRest";
import { searchNearbyPlaces, searchTextPlaces, type Place } from "./lib/places";
import { extractEmails, textToHtml } from "./lib/text";
import type { Id, Doc } from "./_generated/dataModel";

const firecrawl = new FirecrawlClient(components.firecrawl);
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

// Per-company scan budget: everything one scan schedules must run within
// this window — after it passes, remaining work is dropped. Keeps Google
// Places / Firecrawl usage strictly bounded per business.
const SCAN_BUDGET_MS = 5 * 60 * 1000;
// Spacing between deep-enrichment scrapes (Firecrawl free-tier friendly).
const ENRICH_SPACING_MS = 10_000;
// Metadata-triage batch size and keep threshold.
const TRIAGE_CHUNK = 40;
const MIN_SCORE = 30;
const EVENT_PICKS = 5;
// Grace period before the agent answers an inbound reply on the owner's
// behalf — the owner is notified immediately and can reply themselves.
const AUTO_REPLY_DELAY_MS = 60 * 60 * 1000;

// Lazy construction: the OpenAI client throws in its constructor if the key
// is missing — build it inside handlers so a missing key only fails the
// function that needs it.
function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

async function askJson(system: string, user: string): Promise<any> {
  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return JSON.parse(completion.choices[0]?.message?.content ?? "{}");
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Firecrawl's free tier caps requests per minute, and its 429s say how long
// to wait — honor that instead of failing the lead.
async function scrapeMarkdown(ctx: ActionCtx, url: string): Promise<string> {
  const ATTEMPTS = 4;
  for (let attempt = 1; ; attempt++) {
    try {
      const page: any = await firecrawl.scrape(ctx, url, {
        formats: ["markdown"],
        onlyMainContent: true,
      });
      return ((page?.markdown ?? "") as string).toString();
    } catch (err) {
      const message = errMessage(err);
      const rateLimited = message.includes("429") || /rate limit/i.test(message);
      if (!rateLimited || attempt >= ATTEMPTS) throw err;
      const hinted = message.match(/retry after (\d+)s/i);
      const waitMs = Math.min(30_000, (hinted ? Number(hinted[1]) + 2 : 8 * attempt) * 1000);
      console.log(`Firecrawl rate limited, retrying ${url} in ${waitMs}ms (attempt ${attempt})`);
      await sleep(waitMs);
    }
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function businessProfileText(business: {
  name?: string;
  url: string;
  description?: string;
  offerings?: string[];
  category?: string;
  address?: string;
  teamSize?: string;
  domain?: string;
  foundedYear?: string;
  notes?: string;
}): string {
  return [
    `Name: ${business.name ?? business.url}`,
    `Category: ${business.category ?? "unknown"}`,
    business.domain ? `Industry/domain: ${business.domain}` : "",
    `Address: ${business.address ?? "unknown"}`,
    `What they sell/do: ${business.description ?? "unknown"}`,
    business.offerings?.length ? `Offerings: ${business.offerings.join("; ")}` : "",
    business.teamSize ? `Team size: ${business.teamSize}` : "",
    business.foundedYear ? `Founded: ${business.foundedYear}` : "",
    business.notes ? `Owner's notes: ${business.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

const CLASSIFICATION_TEXT: Record<string, string> = {
  interested: "interested",
  not_interested: "not interested",
  needs_info: "needs info",
};

// ---------------------------------------------------------------- intake

// Onboarding step 2: read the user's own site, parse a profile, resolve the
// physical location on Google Places, then wait for "Is this you?".
export const intakeBusiness = internalAction({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, { businessId }) => {
    const business = await ctx.runQuery(internal.businesses.getById, { businessId });
    if (!business) return;
    const log = (message: string, kind = "system") =>
      ctx.runMutation(internal.activity.log, { businessId, kind, message });

    try {
      await log("Reading your site…");
      const markdown = await scrapeMarkdown(ctx, business.url);
      if (!markdown) throw new Error("Couldn't read any content from that URL");

      const parsed = await askJson(
        "You extract a compact business profile from a scraped website. Respond with strict JSON only, no markdown fences.",
        `Scraped site content (markdown, may be truncated):
${markdown.slice(0, 10000)}

Respond with JSON exactly matching:
{"name": string, "description": string, "offerings": string[], "category": string, "address": string, "city": string}

- "description": 1-2 factual sentences about what this business sells or does, including price points or specialties if visible.
- "offerings": up to 6 concrete products/services actually mentioned.
- "category": a short label like "coffee shop", "bakery", "yoga studio", "IT services".
- "address" / "city": the street address and city if the site shows them, else "unknown".`,
      );

      await log("Finding your location…");
      const locationHint = [parsed.name, parsed.address !== "unknown" ? parsed.address : parsed.city]
        .filter((s) => typeof s === "string" && s && s !== "unknown")
        .join(" ");
      const matches = await searchTextPlaces(locationHint || business.url, { maxResultCount: 3 });
      const match = matches[0];
      if (!match) {
        throw new Error(
          `Couldn't find "${parsed.name ?? business.url}" on Google Places — check that your site shows your address.`,
        );
      }

      await ctx.runMutation(internal.businesses.saveProfile, {
        businessId,
        name: typeof parsed.name === "string" && parsed.name !== "unknown" ? parsed.name : match.name,
        description: typeof parsed.description === "string" ? parsed.description : undefined,
        offerings: Array.isArray(parsed.offerings)
          ? parsed.offerings.filter((o: unknown): o is string => typeof o === "string").slice(0, 6)
          : undefined,
        category: typeof parsed.category === "string" ? parsed.category : undefined,
        address: match.address,
        placeId: match.placeId,
        lat: match.lat,
        lng: match.lng,
      });
      await log(`Matched you to ${match.name} — ${match.address ?? "no address"}. Confirm to start the scan.`);
    } catch (err) {
      const message = errMessage(err);
      await ctx.runMutation(internal.businesses.fail, { businessId, error: message });
      await log(`Setup failed: ${message}`);
    }
  },
});

// -------------------------------------------------------------- sourcing

type Candidate = { place: Place; hint: "nearby" | "office" | "customer" };

async function gatherCandidatePool(business: Doc<"businesses">): Promise<Candidate[]> {
  const lat = business.lat!;
  const lng = business.lng!;
  const pool: Candidate[] = [];
  const seen = new Set<string>(business.placeId ? [business.placeId] : []);
  const push = (places: Place[], hint: Candidate["hint"]) => {
    for (const place of places) {
      if (seen.has(place.placeId)) continue;
      seen.add(place.placeId);
      pool.push({ place, hint });
    }
  };

  // Two nearby sweeps: the immediate block, then the wider area.
  push(await searchNearbyPlaces({ lat, lng, radiusMeters: 1500, maxResultCount: 20 }), "nearby");
  try {
    push(await searchNearbyPlaces({ lat, lng, radiusMeters: 4000, maxResultCount: 20 }), "nearby");
  } catch (err) {
    console.error("Wide nearby search failed", err);
  }

  // Offices / coworking.
  try {
    push(
      await searchTextPlaces(`coworking spaces, business parks and company offices near ${business.address ?? ""}`, {
        lat,
        lng,
        radiusMeters: 5000,
        maxResultCount: 20,
      }),
      "office",
    );
  } catch (err) {
    console.error("Office search failed", err);
  }

  // Customer prospects: OpenAI names up to three ideal-customer searches,
  // Places grounds each to real organizations.
  try {
    const q = await askJson(
      "You write up to THREE Google Places text-search queries that find nearby organizations likely to BUY from a given business (its B2B customer prospects). Respond with strict JSON only.",
      `Business:
${businessProfileText(business)}

Respond with JSON: {"queries": string[]} — up to 3 short, concrete Places searches near the business's area, each targeting a different customer segment, e.g. ["startups and software companies near Baner Pune", "manufacturing companies near Baner Pune", "colleges and universities near Pune"]. Ground them in what this business actually sells.`,
    );
    const queries: string[] = Array.isArray(q.queries)
      ? q.queries.filter((s: unknown): s is string => typeof s === "string" && !!s.trim()).slice(0, 3)
      : [];
    for (const query of queries) {
      try {
        push(
          await searchTextPlaces(query.trim(), { lat, lng, radiusMeters: 6000, maxResultCount: 20 }),
          "customer",
        );
      } catch (err) {
        console.error("Customer search failed", query, err);
      }
    }
  } catch (err) {
    console.error("Customer query generation failed", err);
  }

  return pool;
}

type Triaged = {
  candidate: Candidate;
  verdict: "competitor" | "complement" | "office" | "customer";
  relevanceNote?: string;
  score: number;
};

async function triageChunk(business: Doc<"businesses">, chunk: Candidate[]): Promise<Triaged[]> {
  const listing = chunk
    .map(({ place, hint }, i) => {
      const parts = [
        `${i + 1}. ${place.name}`,
        `categories: ${place.types.slice(0, 6).join(", ") || "unknown"}`,
        place.address ?? "",
        place.rating !== undefined ? `rating ${place.rating}` : "",
        hint === "office" ? "(from office search)" : hint === "customer" ? "(from customer-prospect search)" : "",
      ];
      return parts.filter(Boolean).join(" | ");
    })
    .join("\n");

  const out = await askJson(
    "You triage a list of real nearby organizations for a local business owner building an outreach pipeline. Judge each from its name, categories, address, and rating. Respond with strict JSON only.",
    `My business:
${businessProfileText(business)}

Candidates:
${listing}

Respond with JSON: {"items": [{"index": <1-based number>, "verdict": "competitor" | "complement" | "office" | "customer" | "skip", "relevanceNote": string, "score": number}]} — one item per candidate.

- competitor = sells substantially the same thing to the same customers; complement = adjacent offering with cross-promo potential; office = workplace worth pitching (perks, bulk orders, services); customer = would plausibly BUY what my business sells; skip = clearly irrelevant (residential, government infrastructure, unrelated).
- Be inclusive: the owner wants a broad prospect list — prefer a non-skip verdict whenever a pitch is plausible.
- "relevanceNote": ONE short concrete sentence on why this is worth pitching (or why skip).
- "score": 0-100 how promising the pitch is.`,
  );

  const verdicts = new Set(["competitor", "complement", "office", "customer"]);
  const items: any[] = Array.isArray(out.items) ? out.items : [];
  const result: Triaged[] = [];
  for (const item of items) {
    const candidate = chunk[Number(item?.index) - 1];
    if (!candidate || !verdicts.has(item.verdict)) continue;
    const score = typeof item.score === "number" ? item.score : 0;
    if (score < MIN_SCORE) continue;
    result.push({
      candidate,
      verdict: item.verdict,
      relevanceNote: typeof item.relevanceNote === "string" ? item.relevanceNote : undefined,
      score,
    });
  }
  return result;
}

export const sourceLeads = internalAction({
  args: { businessId: v.id("businesses"), rescan: v.boolean() },
  handler: async (ctx, { businessId, rescan }) => {
    const business = await ctx.runQuery(internal.businesses.getById, { businessId });
    if (!business) return;
    const log = (message: string) =>
      ctx.runMutation(internal.activity.log, { businessId, kind: "sourcing", message });

    try {
      if (business.lat === undefined || business.lng === undefined) {
        throw new Error("Business has no resolved location — restart setup");
      }
      const deadline = Date.now() + SCAN_BUDGET_MS;
      await log(rescan ? "Rescanning your block for new leads…" : "Scanning your block…");

      let pool = await gatherCandidatePool(business);
      // Rescan dedupe up front so triage tokens aren't spent on known places.
      const known = new Set(await ctx.runQuery(internal.leads.listPlaceIds, { businessId }));
      pool = pool.filter((c) => !known.has(c.place.placeId));
      await log(`Found ${pool.length} nearby organizations — judging them…`);

      const inserted: { leadId: Id<"leads">; score: number; url?: string }[] = [];
      let kept = 0;
      for (let i = 0; i < pool.length; i += TRIAGE_CHUNK) {
        const chunk = pool.slice(i, i + TRIAGE_CHUNK);
        let triaged: Triaged[] = [];
        try {
          triaged = await triageChunk(business, chunk);
        } catch (err) {
          console.error("Triage chunk failed", err);
          continue;
        }
        for (const t of triaged) {
          const leadId: Id<"leads"> | null = await ctx.runMutation(internal.leads.saveSourced, {
            businessId,
            type: t.verdict,
            name: t.candidate.place.name,
            address: t.candidate.place.address,
            url: t.candidate.place.website,
            placeId: t.candidate.place.placeId,
            sourceUrl: t.candidate.place.website,
            relevanceNote: t.relevanceNote,
            score: t.score,
          });
          if (leadId) {
            kept += 1;
            inserted.push({ leadId, score: t.score, url: t.candidate.place.website });
          }
        }
      }

      // Deep enrichment (site scrape → contact email → draft) for the
      // top-scored leads with websites, spaced out and cut off at the
      // scan budget.
      const enrichable = inserted
        .filter((l) => !!l.url)
        .sort((a, b) => b.score - a.score);
      const slots = Math.max(0, Math.floor((deadline - Date.now() - 20_000) / ENRICH_SPACING_MS));
      const toEnrich = enrichable.slice(0, slots);
      for (let i = 0; i < toEnrich.length; i++) {
        await ctx.scheduler.runAfter(i * ENRICH_SPACING_MS, internal.pipeline.enrichLeadDetails, {
          leadId: toEnrich[i].leadId,
          deadline,
        });
      }

      await ctx.scheduler.runAfter(2_000, internal.pipeline.sourceEvents, { businessId, deadline });
      await ctx.runMutation(internal.businesses.markScanned, { businessId });
      await log(
        `Kept ${kept} leads. Finding contact emails for the top ${toEnrich.length} within the scan budget — the rest stay listed for later enrichment.`,
      );
    } catch (err) {
      const message = errMessage(err);
      if (!rescan) {
        await ctx.runMutation(internal.businesses.fail, { businessId, error: message });
      }
      await log(`Sourcing failed: ${message}`);
    }
  },
});

// Deep second pass for one stored lead: scrape their site for a contact
// email and concrete evidence, then queue the personalized draft.
export const enrichLeadDetails = internalAction({
  args: { leadId: v.id("leads"), deadline: v.optional(v.number()) },
  handler: async (ctx, { leadId, deadline }) => {
    if (deadline !== undefined && Date.now() > deadline) return;
    const lead = await ctx.runQuery(internal.leads.get, { leadId });
    if (!lead || !lead.url || lead.contactEmail || lead.status !== "sourced") return;

    let content = "";
    try {
      content = (await scrapeMarkdown(ctx, lead.url)).slice(0, 8000);
    } catch (err) {
      console.error("Lead site scrape failed", lead.url, err);
    }

    let contactEmail = extractEmails(content)[0];
    if (!contactEmail && lead.url) {
      try {
        const origin = new URL(lead.url).origin;
        contactEmail = extractEmails(await scrapeMarkdown(ctx, `${origin}/contact`))[0];
      } catch {
        // no contact page — lead stays listed without an email
      }
    }

    const evidence = content ? content.replace(/\s+/g, " ").slice(0, 350) : undefined;
    if (!contactEmail && !evidence) return;
    await ctx.runMutation(internal.leads.saveEnrichment, { leadId, contactEmail, evidence });
    if (contactEmail) {
      await ctx.scheduler.runAfter(0, internal.pipeline.generateDraft, { leadId });
    }
  },
});

// Events branch: Firecrawl web search grounds real local events (Luma /
// Eventbrite / Meetup pages), OpenAI scores fit, Convex stores the leads.
export const sourceEvents = internalAction({
  args: { businessId: v.id("businesses"), deadline: v.optional(v.number()) },
  handler: async (ctx, { businessId, deadline }) => {
    if (deadline !== undefined && Date.now() > deadline) {
      console.log("Scan budget exhausted — skipping event search");
      return;
    }
    const business = await ctx.runQuery(internal.businesses.getById, { businessId });
    if (!business) return;
    const log = (message: string) =>
      ctx.runMutation(internal.activity.log, { businessId, kind: "sourcing", message });

    try {
      const query = `upcoming local business networking or community events near ${business.address ?? business.name ?? ""} site:lu.ma OR site:eventbrite.com OR site:meetup.com`;
      const results: any = await firecrawl.search(ctx, query, { limit: 10 } as any);
      const entries: any[] =
        results?.web ?? results?.results ?? results?.data?.web ?? (Array.isArray(results?.data) ? results.data : []);
      if (!entries || entries.length === 0) {
        await log("No nearby events found this scan.");
        return;
      }

      const listing = entries
        .map((e: any, i: number) => `${i + 1}. ${e.title ?? e.url}\n   ${e.url}\n   ${e.description ?? ""}`)
        .join("\n");
      const picked = await askJson(
        "You pick which local events are genuinely worth a small business pitching, sponsoring, or attending. Respond with strict JSON only.",
        `My business:
${businessProfileText(business)}

Search results for nearby events:
${listing}

Respond with JSON: {"picks": [{"index": <1-based number>, "name": string, "why": string}]}
Pick at most ${EVENT_PICKS}. "why" is one short sentence on the concrete opportunity. Return {"picks": []} if none are actually local and relevant.`,
      );

      const picks: { index: number; name?: string; why?: string }[] = Array.isArray(picked.picks)
        ? picked.picks.filter((p: any) => Number.isInteger(p?.index))
        : [];
      if (picks.length === 0) {
        await log("No relevant events this scan.");
        return;
      }

      for (const pick of picks.slice(0, EVENT_PICKS)) {
        const entry = entries[pick.index - 1];
        if (!entry?.url) continue;
        let contactEmail: string | undefined;
        let evidence: string | undefined = entry.description?.slice(0, 300);
        try {
          const pageMd = await scrapeMarkdown(ctx, entry.url);
          contactEmail = extractEmails(pageMd)[0];
          if (!evidence) evidence = pageMd.slice(0, 300);
        } catch {
          // event page not scrapable — keep the search snippet
        }
        const leadId: Id<"leads"> | null = await ctx.runMutation(internal.leads.saveSourced, {
          businessId,
          type: "event",
          name: pick.name ?? entry.title ?? entry.url,
          url: entry.url,
          sourceUrl: entry.url,
          contactEmail,
          relevanceNote: pick.why,
          evidence,
        });
        if (leadId && contactEmail) {
          await ctx.scheduler.runAfter(0, internal.pipeline.generateDraft, { leadId });
        }
      }
    } catch (err) {
      await log(`Event search unavailable: ${errMessage(err)}`);
    }
  },
});

// -------------------------------------------------------------- outreach

// One personalized, properly formatted draft per lead. Waits for approval
// unless the business has auto-send on.
export const generateDraft = internalAction({
  args: { leadId: v.id("leads") },
  handler: async (ctx, { leadId }) => {
    const lead = await ctx.runQuery(internal.leads.get, { leadId });
    if (!lead || !lead.contactEmail) return;
    const business = await ctx.runQuery(internal.businesses.getById, {
      businessId: lead.businessId,
    });
    if (!business) return;

    const outreachId: Id<"outreach"> = await ctx.runMutation(internal.outreach.ensureForLead, {
      leadId,
      businessId: lead.businessId,
    });

    try {
      const draft = await askJson(
        "You write short, professional B2B outreach emails from one local business owner to a nearby business, office, event organizer, or prospective customer. Warm, specific, zero spam clichés, no placeholder brackets, plain text. Respond with strict JSON only.",
        `Sender (writing as the owner):
${businessProfileText(business)}

Recipient:
Name: ${lead.name}
Kind: ${lead.type}
Why we're reaching out (real, from research): ${lead.relevanceNote ?? "nearby business"}
Evidence from their site: ${lead.evidence ?? "n/a"}

Write the email. Respond with JSON: {"subject": string, "body": string}
- subject: under 55 characters, concrete, no clickbait, never ALL CAPS.
- body: 90-140 words, plain text, formatted exactly like a real email:
  Line 1: "Hi ${lead.name} team," (shorten the name naturally if it's long)
  Blank line, then paragraph 1 (1-2 sentences): the specific real detail from the research — why them, why now. Never "I hope this finds you well".
  Blank line, then paragraph 2 (1-2 sentences): who we are in half a sentence, plus ONE concrete proposal that fits a ${lead.type} (cross-promo, bundle, referral swap, event booth/catering, office perk or bulk order — or, for a customer prospect, a specific first offer of your product/service tailored to what they do).
  Optionally 2-3 short "- " bullet lines if they genuinely sharpen the proposal.
  Blank line, then a low-friction closing ask (a short reply or a 15-minute chat).
  Blank line, then exactly:
  "Best,
${business.name ?? "the owner"}
${business.url}"`,
      );
      if (typeof draft.subject !== "string" || typeof draft.body !== "string") {
        throw new Error("Draft generation returned an unexpected shape");
      }
      await ctx.runMutation(internal.outreach.saveDraft, {
        outreachId,
        subject: draft.subject.slice(0, 120),
        draftText: draft.body,
      });

      if (business.approvalMode === "auto_send") {
        const approved: boolean = await ctx.runMutation(internal.outreach.markApproved, {
          outreachId,
        });
        if (approved) {
          await ctx.scheduler.runAfter(0, internal.pipeline.sendOutreach, { outreachId });
        }
      }
    } catch (err) {
      await ctx.runMutation(internal.outreach.saveDraftFailure, {
        outreachId,
        error: errMessage(err),
      });
    }
  },
});

// Send the approved draft from the app's AgentMail inbox — text plus a
// clean HTML rendering. REST (not the component's async queue) because we
// need message_id/thread_id back synchronously to track replies.
export const sendOutreach = internalAction({
  args: { outreachId: v.id("outreach") },
  handler: async (ctx, { outreachId }) => {
    const outreach = await ctx.runQuery(internal.outreach.get, { outreachId });
    if (!outreach || outreach.sentAt !== undefined) return;
    const lead = await ctx.runQuery(internal.leads.get, { leadId: outreach.leadId });
    if (!lead?.contactEmail) return;

    try {
      const inbox = await ctx.runQuery(internal.inbox.getInternal, {});
      if (!inbox) throw new Error("No AgentMail inbox provisioned — create one from the dashboard");
      if (!outreach.subject || !outreach.draftText) throw new Error("Draft is empty");

      const res = await agentmailApiFetch(
        `/inboxes/${encodeURIComponent(inbox.inboxId)}/messages/send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: [lead.contactEmail],
            subject: outreach.subject,
            text: outreach.draftText,
            html: textToHtml(outreach.draftText),
          }),
        },
      );
      const messageId = res.message_id ?? res.messageId;
      const threadId = res.thread_id ?? res.threadId;
      if (!messageId || !threadId) throw new Error("AgentMail send returned no message/thread id");

      await ctx.runMutation(internal.outreach.markSent, {
        outreachId,
        inboxId: inbox.inboxId,
        agentmailMessageId: messageId,
        agentmailThreadId: threadId,
      });
    } catch (err) {
      await ctx.runMutation(internal.outreach.markSendFailed, {
        outreachId,
        error: errMessage(err),
      });
    }
  },
});

// The single follow-up (cron-fired or manual). One and done — after this,
// silence means the lead goes cold.
export const sendFollowUp = internalAction({
  args: { outreachId: v.id("outreach") },
  handler: async (ctx, { outreachId }) => {
    const outreach = await ctx.runQuery(internal.outreach.get, { outreachId });
    if (
      !outreach ||
      outreach.sentAt === undefined ||
      outreach.followUpSentAt !== undefined ||
      outreach.lastReplyAt !== undefined ||
      !outreach.inboxId ||
      !outreach.agentmailMessageId
    ) {
      return;
    }
    const lead = await ctx.runQuery(internal.leads.get, { leadId: outreach.leadId });
    const business = await ctx.runQuery(internal.businesses.getById, {
      businessId: outreach.businessId,
    });

    let text = `Hi — just floating this back to the top of your inbox in case it got buried. Still happy to chat whenever suits. If it's not a fit, no worries at all.\n\nBest,\n${business?.name ?? ""}`.trim();
    try {
      const generated = await askJson(
        "You write a 2-3 sentence friendly follow-up to an unanswered business outreach email. Not pushy, no guilt-tripping. Plain text. Respond with strict JSON only.",
        `Original email we sent to ${lead?.name ?? "a nearby business"}:
Subject: ${outreach.subject ?? ""}
${outreach.draftText ?? ""}

Respond with JSON: {"body": string} — 2-3 sentences, reference the original idea in a few words, end with an easy out. Sign off with "Best,\\n${business?.name ?? "the owner"}".`,
      );
      if (typeof generated.body === "string" && generated.body.trim()) {
        text = generated.body.trim();
      }
    } catch (err) {
      console.error("Follow-up generation failed, using fallback", err);
    }

    try {
      await agentmailApiFetch(
        `/inboxes/${encodeURIComponent(outreach.inboxId)}/messages/${encodeURIComponent(outreach.agentmailMessageId)}/reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, html: textToHtml(text) }),
        },
      );
      await ctx.runMutation(internal.outreach.markFollowedUp, { outreachId, text });
    } catch (err) {
      await ctx.runMutation(internal.outreach.markSendFailed, {
        outreachId,
        error: `Follow-up failed: ${errMessage(err)}`,
      });
    }
  },
});

// The owner's own in-app reply, relayed through the agent inbox into the
// same thread. Its message row also pre-empts the delayed auto-reply.
export const sendManualReply = internalAction({
  args: { outreachId: v.id("outreach"), text: v.string() },
  handler: async (ctx, { outreachId, text }) => {
    const outreach = await ctx.runQuery(internal.outreach.get, { outreachId });
    if (!outreach || outreach.sentAt === undefined || !outreach.inboxId) return;
    const thread = await ctx.runQuery(internal.outreach.listThreadMessages, { outreachId });
    const lastInbound = [...thread]
      .reverse()
      .find((m) => m.direction === "inbound" && m.agentmailMessageId);
    const replyTo = lastInbound?.agentmailMessageId ?? outreach.agentmailMessageId;
    if (!replyTo) return;

    try {
      await agentmailApiFetch(
        `/inboxes/${encodeURIComponent(outreach.inboxId)}/messages/${encodeURIComponent(replyTo)}/reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, html: textToHtml(text) }),
        },
      );
      await ctx.runMutation(internal.outreach.recordManualReply, { outreachId, text });
    } catch (err) {
      await ctx.runMutation(internal.outreach.markSendFailed, {
        outreachId,
        error: `Your reply failed to send: ${errMessage(err)}`,
      });
    }
  },
});

// Inbound reply → classify, notify the owner immediately, and give them a
// one-hour window to answer themselves before the agent replies for them.
export const classifyReply = internalAction({
  args: {
    outreachId: v.id("outreach"),
    messageRowId: v.id("messages"),
    text: v.string(),
  },
  handler: async (ctx, { outreachId, messageRowId, text }) => {
    const outreach = await ctx.runQuery(internal.outreach.get, { outreachId });
    if (!outreach) return;

    let classification: "interested" | "not_interested" | "needs_info" = "needs_info";
    try {
      const result = await askJson(
        'You classify replies to business partnership outreach emails. Respond with strict JSON only: {"classification": "interested" | "not_interested" | "needs_info"}.',
        `Our outreach:
Subject: ${outreach.subject ?? ""}
${outreach.draftText ?? ""}

Their reply:
${text.slice(0, 4000)}

- "interested": positive, wants to proceed, proposes a time, says yes.
- "not_interested": declines, unsubscribe-tone, clearly negative.
- "needs_info": asks questions, non-committal, or unclear.`,
      );
      if (["interested", "not_interested", "needs_info"].includes(result.classification)) {
        classification = result.classification;
      }
    } catch (err) {
      console.error("Reply classification failed", err);
    }

    await ctx.runMutation(internal.outreach.saveClassification, {
      outreachId,
      messageRowId,
      classification,
    });

    const business = await ctx.runQuery(internal.businesses.getById, {
      businessId: outreach.businessId,
    });
    const lead = await ctx.runQuery(internal.leads.get, { leadId: outreach.leadId });
    if (!business) return;
    const label = CLASSIFICATION_TEXT[classification];

    // Notify the owner at their signup address, right away.
    try {
      const owner = await ctx.runQuery(internal.users.getById, { userId: business.userId });
      if (owner?.email && outreach.inboxId) {
        const siteUrl = process.env.CONVEX_SITE_URL ?? "";
        const notice = `${lead?.name ?? "A lead"} replied to your ${business.name ?? ""} outreach — classified: ${label}.

Their reply:
"${text.slice(0, 500)}"

Open Block to read the thread and respond:
${siteUrl}

If you don't respond within 1 hour, your agent will reply on your behalf automatically${business.autoReply === false ? " (currently turned OFF in Settings)" : ""}.`;
        await agentmailApiFetch(`/inboxes/${encodeURIComponent(outreach.inboxId)}/messages/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: [owner.email],
            subject: `${lead?.name ?? "A lead"} replied — ${label}`,
            text: notice,
            html: textToHtml(notice),
          }),
        });
      }
    } catch (err) {
      console.error("Owner notification failed", err);
    }

    // Grace window, then the agent answers — unless the owner already did.
    if (business.autoReply !== false && outreach.inboxId) {
      await ctx.scheduler.runAfter(AUTO_REPLY_DELAY_MS, internal.pipeline.sendAutoReply, {
        outreachId,
        messageRowId,
      });
    }
  },
});

// Fires an hour after an inbound reply. Skips itself if that reply is no
// longer the last message in the thread (the owner replied, or a newer
// inbound arrived with its own pending auto-reply).
export const sendAutoReply = internalAction({
  args: { outreachId: v.id("outreach"), messageRowId: v.id("messages") },
  handler: async (ctx, { outreachId, messageRowId }) => {
    const outreach = await ctx.runQuery(internal.outreach.get, { outreachId });
    const business = outreach
      ? await ctx.runQuery(internal.businesses.getById, { businessId: outreach.businessId })
      : null;
    const messageRow = await ctx.runQuery(internal.outreach.getMessageRow, { messageRowId });
    if (
      !outreach ||
      !business ||
      business.autoReply === false ||
      !outreach.inboxId ||
      !messageRow?.agentmailMessageId
    ) {
      return;
    }
    const thread = await ctx.runQuery(internal.outreach.listThreadMessages, { outreachId });
    const last = thread[thread.length - 1];
    if (!last || last._id !== messageRowId) return; // someone already answered

    const lead = await ctx.runQuery(internal.leads.get, { leadId: outreach.leadId });
    const classification = outreach.replyClassification ?? "needs_info";
    try {
      const transcript = thread
        .map(
          (m) =>
            `${m.direction === "outbound" ? (business.name ?? "Us") : (lead?.name ?? "Them")}: ${m.text.slice(0, 1500)}`,
        )
        .join("\n---\n");
      const guidance =
        classification === "interested"
          ? "They're interested: thank them, propose ONE concrete next step (a quick call or meeting this week), and ask what time suits them."
          : classification === "needs_info"
            ? "They asked for more information: answer their questions using ONLY facts from the business profile and thread. For anything you don't know, say the owner will confirm the specifics."
            : "They're not interested: thank them warmly in 1-2 sentences, leave the door open, and do NOT try to persuade them.";
      const generated = await askJson(
        "You are an outreach agent replying on behalf of a small business owner in an ongoing email thread. Professional, warm, concise (3-6 sentences). Never invent facts not present in the profile or thread. Plain text. Respond with strict JSON only.",
        `Business you represent:
${businessProfileText(business)}

Thread so far (oldest first):
${transcript}

Their latest reply:
${messageRow.text.slice(0, 3000)}

${guidance}

Respond with JSON: {"body": string} — the reply email body, signed off with "Best,\\n${business.name ?? "the owner"}".`,
      );
      if (typeof generated.body !== "string" || !generated.body.trim()) return;
      const body = generated.body.trim();
      await agentmailApiFetch(
        `/inboxes/${encodeURIComponent(outreach.inboxId)}/messages/${encodeURIComponent(messageRow.agentmailMessageId)}/reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: body, html: textToHtml(body) }),
        },
      );
      await ctx.runMutation(internal.outreach.recordAutoReply, { outreachId, text: body });
    } catch (err) {
      console.error("Auto-reply failed", err);
    }
  },
});
