"use node";

// The agentic pipeline (PLAN.md): Firecrawl scrapes real pages, Google
// Places grounds "what's physically nearby", OpenAI judges/drafts/classifies
// over that grounded data, AgentMail sends from the app's own inbox.

import { v } from "convex/values";
import { internalAction, type ActionCtx } from "./_generated/server";
import { internal, components } from "./_generated/api";
import OpenAI from "openai";
import { FirecrawlClient } from "@firecrawl/firecrawl-convex";
import { agentmailApiFetch } from "./lib/agentmailRest";
import { searchNearbyPlaces, searchTextPlaces, type Place } from "./lib/places";
import { extractEmails } from "./lib/text";
import type { Id } from "./_generated/dataModel";

const firecrawl = new FirecrawlClient(components.firecrawl);
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

// Small fixed radius so demo data stays reliable (PLAN.md guardrail).
const RADIUS_METERS = 1200;
const NEARBY_CAP = 10;
const OFFICE_CAP = 4;
const EVENT_PICKS = 3;

// Per-company scan budget: everything one scan schedules must run within
// this window — after it passes, remaining candidates are dropped. Keeps
// Google Places / Firecrawl usage strictly bounded per business.
const SCAN_BUDGET_MS = 5 * 60 * 1000;

// Lazy construction: the OpenAI client throws in its constructor if the key
// is missing, and Convex bundles every module at push time — build it inside
// handlers so a missing key only fails the function that needs it.
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
// to wait ("please retry after 4s"). Honor that instead of failing the
// candidate — a scan fans out over many scrapes and will brush the cap.
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
}): string {
  return [
    `Name: ${business.name ?? business.url}`,
    `Category: ${business.category ?? "unknown"}`,
    `Address: ${business.address ?? "unknown"}`,
    `What they sell/do: ${business.description ?? "unknown"}`,
    business.offerings?.length ? `Offerings: ${business.offerings.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

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
- "category": a short label like "coffee shop", "bakery", "yoga studio", "bookstore".
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

// Google Places (real nearby entities) → Firecrawl (real content) →
// OpenAI (judgment) → Convex (lead). Also kicks off the events branch.
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

      const nearby = await searchNearbyPlaces({
        lat: business.lat,
        lng: business.lng,
        radiusMeters: RADIUS_METERS,
        maxResultCount: 20,
      });

      let offices: Place[] = [];
      try {
        offices = await searchTextPlaces(
          `coworking spaces and company offices near ${business.address ?? ""}`,
          { lat: business.lat, lng: business.lng, radiusMeters: 2000, maxResultCount: 8 },
        );
      } catch (err) {
        console.error("Office search failed", err);
      }

      const seen = new Set<string>(business.placeId ? [business.placeId] : []);
      const candidates: { place: Place; bucket: "place" | "office" }[] = [];
      for (const place of nearby) {
        if (seen.has(place.placeId) || candidates.length >= NEARBY_CAP) continue;
        seen.add(place.placeId);
        candidates.push({ place, bucket: "place" });
      }
      let officeCount = 0;
      for (const place of offices) {
        if (seen.has(place.placeId) || officeCount >= OFFICE_CAP) continue;
        seen.add(place.placeId);
        candidates.push({ place, bucket: "office" });
        officeCount += 1;
      }

      await log(`Found ${candidates.length} nearby places…`);
      await log("Judging competitors vs. complements from what they actually sell…");

      // Staggered fan-out: each candidate is scraped + judged on its own,
      // so leads stream onto the dashboard as they're decided. 10s apart —
      // each candidate can cost up to two Firecrawl calls, and the free
      // tier caps requests per minute (saw 429s at ~1.5s spacing).
      for (let i = 0; i < candidates.length; i++) {
        const { place, bucket } = candidates[i];
        await ctx.scheduler.runAfter(i * 10_000, internal.pipeline.enrichCandidate, {
          businessId,
          bucket,
          name: place.name,
          placeId: place.placeId,
          address: place.address,
          website: place.website,
          types: place.types,
          deadline,
        });
      }

      // Events run their own search + up to 3 page scrapes — start them
      // after the candidate fan-out has thinned out.
      await ctx.scheduler.runAfter(
        (candidates.length + 1) * 10_000,
        internal.pipeline.sourceEvents,
        { businessId, deadline },
      );
      await ctx.runMutation(internal.businesses.markScanned, { businessId });
    } catch (err) {
      const message = errMessage(err);
      if (!rescan) {
        await ctx.runMutation(internal.businesses.fail, { businessId, error: message });
      }
      await log(`Sourcing failed: ${message}`);
    }
  },
});

// One candidate: scrape its site, judge rival/complement/office/noise from
// actual content (category alone is weak signal), find a contact email,
// store the lead, and queue a personalized draft.
export const enrichCandidate = internalAction({
  args: {
    businessId: v.id("businesses"),
    bucket: v.union(v.literal("place"), v.literal("office")),
    name: v.string(),
    placeId: v.string(),
    address: v.optional(v.string()),
    website: v.optional(v.string()),
    types: v.optional(v.array(v.string())),
    deadline: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { businessId, bucket, name, placeId, address, website, types } = args;
    if (args.deadline !== undefined && Date.now() > args.deadline) {
      console.log(`Scan budget exhausted — dropping candidate ${name}`);
      return;
    }
    const existing = await ctx.runQuery(internal.leads.byPlace, { businessId, placeId });
    if (existing) return; // rescan dedupe
    const business = await ctx.runQuery(internal.businesses.getById, { businessId });
    if (!business) return;
    const log = (message: string) =>
      ctx.runMutation(internal.activity.log, { businessId, kind: "sourcing", message });

    try {
      let content = "";
      if (website) {
        try {
          content = (await scrapeMarkdown(ctx, website)).slice(0, 8000);
        } catch (err) {
          console.error("Candidate scrape failed", website, err);
        }
      }

      const judged = await askJson(
        "You judge whether a nearby business matters to a local business owner doing partnership/outreach mapping. Judge from what each actually sells, not just category labels — a bakery and a coffee shop are both 'food' but are usually complements, not rivals. Respond with strict JSON only.",
        `My business:
${businessProfileText(business)}

Nearby candidate:
Name: ${name}
Address: ${address ?? "unknown"}
Google categories: ${(types ?? []).join(", ") || "unknown"}
${content ? `Their website content (markdown, truncated):\n${content}` : "No website content available — judge from name and categories only, conservatively."}
${bucket === "office" ? "\nThis candidate came from an offices/coworking search: if it's a real office, coworking space, or company HQ, verdict should be \"office\" (they're a bulk-order / catering / perks pitch target), else \"skip\"." : ""}

Respond with JSON exactly matching:
{"verdict": "competitor" | "complement" | "office" | "skip", "relevanceNote": string, "evidence": string, "score": number}

- "verdict": competitor = sells substantially the same thing to the same customers; complement = adjacent offering with cross-promo potential; office = workplace worth pitching; skip = irrelevant or too weak to pitch.
- "relevanceNote": ONE short sentence on why this is worth pitching (a gap, an overlap, a concrete opportunity — e.g. "closed Sundays, you're open"). For skip, why not.
- "evidence": a short concrete fact/quote from their content backing the note ("" if none).
- "score": 0-100 how worth pitching this lead is.`,
      );

      const verdicts = ["competitor", "complement", "office"];
      const verdict = verdicts.includes(judged.verdict) ? judged.verdict : "skip";
      const score = typeof judged.score === "number" ? judged.score : 0;
      if (verdict === "skip" || score < 35) {
        await log(`Passed on ${name}${judged.relevanceNote ? ` — ${judged.relevanceNote}` : ""}`);
        return;
      }

      let contactEmail = extractEmails(content)[0];
      if (!contactEmail && website) {
        try {
          const origin = new URL(website).origin;
          contactEmail = extractEmails(await scrapeMarkdown(ctx, `${origin}/contact`))[0];
        } catch {
          // no contact page — lead stays pitchable manually
        }
      }

      const leadId: Id<"leads"> | null = await ctx.runMutation(internal.leads.saveSourced, {
        businessId,
        type: verdict,
        name,
        address,
        url: website,
        placeId,
        sourceUrl: website,
        contactEmail,
        relevanceNote: typeof judged.relevanceNote === "string" ? judged.relevanceNote : undefined,
        evidence: typeof judged.evidence === "string" && judged.evidence ? judged.evidence.slice(0, 400) : undefined,
        score,
      });
      if (!leadId) return;

      if (contactEmail) {
        await ctx.scheduler.runAfter(0, internal.pipeline.generateDraft, { leadId });
      } else {
        await log(`No contact email found for ${name} — sourced without outreach draft`);
      }
    } catch (err) {
      await log(`Couldn't judge ${name}: ${errMessage(err)}`);
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
      const results: any = await firecrawl.search(ctx, query, { limit: 8 } as any);
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
Pick at most ${EVENT_PICKS}. "why" is one short sentence on the concrete opportunity (e.g. "200-person tech meetup next week — catering pitch"). Return {"picks": []} if none are actually local and relevant.`,
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

// One personalized draft per lead, referencing something real. Waits for
// approval unless the business has auto-send on.
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
        "You write short, professional first-touch emails from one local business owner to a nearby business, office, or event organizer. Warm, specific, zero spam clichés, no placeholder brackets. Plain text body. Respond with strict JSON only.",
        `Sender (writing as the owner):
${businessProfileText(business)}

Recipient:
Name: ${lead.name}
Kind: ${lead.type}
Why we're reaching out (real, from research): ${lead.relevanceNote ?? "nearby business"}
Evidence from their site: ${lead.evidence ?? "n/a"}

Write the email. Respond with JSON: {"subject": string, "body": string}
- subject: under 60 characters, concrete, no clickbait.
- body: 90-140 words. Open with the specific real detail from the research (never "I hope this finds you well"). Propose ONE concrete idea that fits a ${lead.type} (e.g. cross-promo, bundle, referral swap, event booth/catering, office perk or bulk order). End with a low-friction ask (a short reply or 15-minute chat). Sign off with "${business.name ?? "the owner"}".`,
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

// Send the approved draft from the app's AgentMail inbox. REST (not the
// component's async queue) because we need message_id/thread_id back
// synchronously to track the thread for inbound replies.
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

    let text = `Hi — just floating this back to the top of your inbox in case it got buried. Still happy to chat whenever suits. If it's not a fit, no worries at all.\n\n${business?.name ?? ""}`.trim();
    try {
      const generated = await askJson(
        "You write a 2-3 sentence friendly follow-up to an unanswered business outreach email. Not pushy, no guilt-tripping. Plain text. Respond with strict JSON only.",
        `Original email we sent to ${lead?.name ?? "a nearby business"}:
Subject: ${outreach.subject ?? ""}
${outreach.draftText ?? ""}

Respond with JSON: {"body": string} — 2-3 sentences, reference the original idea in a few words, end with an easy out. Sign off with "${business?.name ?? "the owner"}".`,
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
          body: JSON.stringify({ text }),
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

// Inbound reply → interested / not interested / needs info.
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

    // The agent answers the reply itself (unless auto-reply is off), so the
    // conversation keeps moving and the whole thread stays visible in-app.
    const business = await ctx.runQuery(internal.businesses.getById, {
      businessId: outreach.businessId,
    });
    const lead = await ctx.runQuery(internal.leads.get, { leadId: outreach.leadId });
    const messageRow = await ctx.runQuery(internal.outreach.getMessageRow, { messageRowId });
    if (
      !business ||
      business.autoReply === false ||
      !outreach.inboxId ||
      !messageRow?.agentmailMessageId
    ) {
      return;
    }
    try {
      const thread = await ctx.runQuery(internal.outreach.listThreadMessages, { outreachId });
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
${text.slice(0, 3000)}

${guidance}

Respond with JSON: {"body": string} — the reply email body, signed off with "${business.name ?? "the owner"}".`,
      );
      if (typeof generated.body !== "string" || !generated.body.trim()) return;
      await agentmailApiFetch(
        `/inboxes/${encodeURIComponent(outreach.inboxId)}/messages/${encodeURIComponent(messageRow.agentmailMessageId)}/reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: generated.body.trim() }),
        },
      );
      await ctx.runMutation(internal.outreach.recordAutoReply, {
        outreachId,
        text: generated.body.trim(),
      });
    } catch (err) {
      console.error("Auto-reply failed", err);
    }
  },
});
