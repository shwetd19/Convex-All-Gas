# Hackathon log

- **Project:** Block (pivoted from Sift, formerly Listing Digest — same repo)
- **Event:** Convex All Gas Hackathon
- **What it does:** Paste your business URL; an AI agent maps your real nearby competitors, complements, offices, and prospective customers (grounded in Google Places + startup directories), drafts personalized outreach per lead, sends from its own AgentMail inbox, follows up, classifies replies, and rescans weekly.
- **Live app:** https://flippant-stork-696.convex.site
- **Repo:** https://github.com/shwetd19/Convex-All-Gas
- **Frontend:** Convex static hosting
- **Convex deployment:** https://flippant-stork-696.convex.cloud
- **Components:** @agentmail/convex, @firecrawl/firecrawl-convex, @convex-dev/static-hosting
- **Other data sources:** Google Places API (New); startup/B2B directories (Y Combinator, Product Hunt, Wellfound, Clutch, F6S)
- **Convex features:** schema, indexes, queries, mutations, actions, internal functions, HTTP actions, crons, scheduled functions (cancel + reschedule), realtime queries, Convex Auth
- **Auth:** Convex Auth
- **AI models:** gpt-4o-mini
- **Started:** 2026-08-27T11:01:54Z
- **Last updated:** 2026-09-03T00:00:00Z

## Log

> The entries below 2026-08-30 document Sift, the job-digest app this repo
> started as. On 2026-08-31 the project pivoted to Block (a local-business
> outreach agent), reusing the Convex + Firecrawl + AgentMail + OpenAI
> foundation. Block-era entries follow.

### 2026-08-27 - 4f754b3
Initial commit with project scaffolding (LICENSE, README, .gitattributes). No Convex project or application code yet.

### 2026-08-28 - working tree
Built the full pipeline end to end. Schema (`convex/schema.ts`) for `emails`, `listings`,
`digests`, and a cached `appInbox`. Wired the AgentMail component for inbound mail
(`convex/email.ts`, `convex/http.ts` webhook route) and the Firecrawl component for scraping
(`convex/listings.ts`). URL/preference-note extraction from the forwarded body
(`convex/lib/extractUrls.ts`). OpenAI field extraction + preference scoring + digest
composition as Node actions (`convex/ai.ts`), with a cron (`convex/crons.ts`,
`convex/maintenance.ts`) to force-send a digest if a batch stalls. Live dashboard
(`src/App.tsx`) using `useQuery` for real-time status as listings move
pending → scraping → scraped → ranked. Patched a bug in `@agentmail/convex@0.1.0` (its
component never declares the env vars it reads, so the parent app had no supported way to
grant it `AGENTMAIL_API_KEY`) via `patch-package`, persisted under `patches/`. Verified
end-to-end against the live inbox: a real forwarded email produced an `emails` row, a scraped
`listings` row, and a digest reply sent back through AgentMail. Deployed to production —
`@convex-dev/static-hosting` serves the frontend at the `convex.site` URL above.

### 2026-08-29 - working tree
Replaced the per-email digest with a debounced batch: every forward reschedules a single
20-minute quiet-period send (`convex/digest.ts`'s `scheduleDigest`, cancel-and-reschedule via
`ctx.scheduler`), so a burst of forwards produces one reply instead of one per email. Added an
explicit override — a subject/note containing "now" or "digest" fires immediately instead of
waiting, and always gets a reply even with nothing pending (`convex/ai.ts`'s `sendDigest`
replies to the requesting email directly via a new `requestedByEmailId` on the schedule row).
Added LLM-classified categories (`jobs` | `flats` | `newsletter` | `other`) to `listings`, so
the batched digest groups by category and a request can scope to one ("jobs now") while
leaving the rest pending. Migrated both deployments' existing data (backfilled `digestedAt` on
already-digested listings, cleared the old per-email `digestSentAt` field) with the safety-net
cron briefly disabled to avoid a spurious resend during the migration window.

### 2026-08-30 - 1c0cdbb
Renamed to Sift and reframed around job hunting. Added login with Convex Auth (`convex/auth.ts`);
one shared inbox still serves everyone, but the dashboard and — after finding that the digest
queue was still global — the whole batching pipeline are now scoped per forwarder
(`digestSchedule.by_owner`, `convex/digest.ts`), so two people sharing the inbox never get
mixed into one digest. Built the reply-to-steer loop: a reply in a digest thread is parsed
("skip #2", "more like #3", or plain English via one OpenAI call), stored in a `feedback` table
(`convex/feedback.ts`), fed into every future scoring prompt (`convex/ai.ts`), and confirmed
in-thread; the dashboard shows the rules with a remove button. Digests are now numbered
continuously and store their ranked order so replies resolve. Dashboard additions: stats strip,
per-second countdown, batch progress bar, "Send digest now", sent-digest history, `/docs`.
Fixed along the way: forwarded subjects ("...Apply Now") triggering the send command;
HTML-only marketing emails producing zero links; 28 tracking-URL variants of the same 6
postings; long URLs/error stacks overflowing the layout. Convex features: schema, indexes,
queries, mutations, actions, HTTP actions, crons, scheduler cancel/reschedule, realtime queries,
Convex Auth, static hosting.

### 2026-08-31 - 04ab54a
Pivoted from Sift to Block: a local-business outreach agent. Reframed the whole product
around a single input — paste a business URL — reusing the Convex + Firecrawl + AgentMail +
OpenAI foundation. New schema (`convex/schema.ts`): `businesses` (scraped profile + status
machine scraping → confirm → sourcing → ready), `leads` (type competitor/complement/office/
event/customer, a full status lifecycle sourced → approved → outreach_sent → replied →
followed_up → cold → won, a relevance note and score), `outreach`, `messages`, and `activity`.
Intake (`convex/pipeline.ts`): Firecrawl scrapes the site, OpenAI extracts name/offerings/
category/location, then a "Is this you?" confirm gate. Added the Google Places API (New)
client (`convex/lib/places.ts`) to ground "nearby" in real data instead of hallucinated names,
and an OpenAI relevance judge that reads each candidate's actual offerings.

### 2026-08-31 - 4420897
Firecrawl was 429-ing during a sourcing scan (candidates scraped ~1.5s apart blew the
free-tier per-minute cap). Added backoff-retry honoring the "retry after Ns" hint in
`scrapeMarkdown`, and spaced enrichment candidates ~10s apart.

### 2026-08-31 - a1936f8 → bb5537b
Made it a real multi-business product with a production UI: unlimited businesses per account
(every function verifies ownership server-side), a bright SaaS dashboard, per-lead draft review
in a modal, AgentMail sending from its own inbox with in-app threads, a follow-up default of
2 days, and a **hard 5-minute scan budget per business** to protect Google/Firecrawl quota.
Scaled sourcing from ~9 to ~140 candidates with a two-tier metadata-triage → deep-enrichment
pass, and added a customer-prospect branch sourcing from startup/B2B directories
(Y Combinator, Product Hunt, Wellfound, Clutch, F6S). On an inbound reply, OpenAI classifies it
(interested / not interested / needs info), the owner is emailed, and a 1-hour grace window
precedes any agent auto-reply.

### 2026-08-31 - f0ccc6f
Design-review guardrail: the agent answering real third parties unsupervised is a departure
from "human stays in control", so auto-reply is now an explicit **opt-in, off by default** —
new businesses default `autoReply: false`, `sendAutoReply` requires an explicit opt-in, and
existing rows were flipped off.

### 2026-08-31 - 9204015, b03855a, a1aae96
UX pass: a live scan-window indicator that shows "still checking" for the full 5 minutes then
"done checking" (driven by a `scanUntil` field + realtime query), a ChatGPT-style bright hero
for the add-business page, a Contact page, and a rebuilt sectioned SaaS Settings page.

### 2026-09-02 - 1af034d
Rebuilt the frontend on shadcn/ui with a proper SaaS dashboard layout (sidebar + business
switcher, per-lead-type sections with counts, activity feed, settings, contact), replacing the
hand-rolled CSS.

### 2026-09-03 - 18dfac2
Hardened `.gitignore` (all `.env*` except `.env.example`, auth keys, `.pem`/`.key`) and audited
the repo for secrets before making it public — no env files or real secret values were ever
tracked or in history.
