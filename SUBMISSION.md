# Block — vibeapps submission draft

> Paste into the vibeapps form. Describes the live production deployment.

**Tagline:** Paste your business URL. An AI agent maps your real local
competitors and customers, then runs personalized outreach from its own inbox.

## The problem

A local business owner — a gym, a studio, a dry cleaner, an agency — knows they
should be reaching out to the businesses around them: the offices that could
become customers, the complementary shops worth partnering with, the events
happening down the street. But nobody has time to research who's actually nearby,
figure out which ones matter, find a contact, write a personal email to each,
remember to follow up, and do it again next week. So it never happens.

The generic "AI GTM" tools that exist are built for funded startups with a
sales team and an ICP spreadsheet. They make you *configure workflows*. A shop
owner needs the opposite: paste one link, and it just works.

## How it works

You paste your business URL. That's the whole interface.

- **It reads your business.** Firecrawl scrapes your site; OpenAI extracts what
  you actually sell, your category, and your location. You get a "Is this you?"
  confirm step that catches a wrong match before a sourcing run is spent.
- **It maps your block, grounded in real data.** OpenAI has no real-time
  knowledge of what's physically near an address — ask it cold and it invents
  plausible business names. So Block grounds sourcing in **Google Places (New)**
  for real nearby competitors, complements, and offices, and in startup/B2B
  directories (Y Combinator, Product Hunt, Wellfound, Clutch, F6S) for
  prospective customers. Firecrawl scrapes each candidate; OpenAI judges it by
  its *actual offerings* — competitor, complement, office, event, or customer —
  because category alone is a weak signal (a bakery and a coffee shop are both
  "food" but might be partners, not rivals). A two-tier pass stores every lead
  from cheap metadata triage, then deep-enriches the top-scored to find a contact
  email — all inside a hard **5-minute scan budget** that protects API quota.
- **It drafts outreach per lead.** OpenAI writes a personalized email referencing
  something real about each lead. Drafts are reviewable and editable in-app.
- **AgentMail sends from its own inbox.** `block@agentmail.to` — a dedicated
  Block-branded identity, never the owner's personal inbox — with one thread per
  lead. This is what keeps it an *agent* instead of a mail merge.
- **It follows up and handles replies on its own.** One automatic follow-up after
  N days (default 2), then it stops — no spamming real businesses. An inbound
  reply is captured via AgentMail's signed webhook and classified by OpenAI
  (interested / not interested / needs info); the owner is emailed immediately,
  and only if they explicitly opt in does the agent auto-reply, after a 1-hour
  grace window so a human can step in first.
- **It keeps working with zero input.** A weekly rescan cron re-sources the block
  and surfaces new leads automatically — the agent always has something to do.

The dashboard is live throughout (Convex realtime queries): a scan-progress
indicator that shows "still checking" across the full 5 minutes then "done",
lead cards grouped by type with a relevance note and a status badge that changes
color the moment a cron or reply moves it, full in-app threads, and an activity
feed.

## Why it's different

Every "AI GTM agent" on the market is a horizontal platform you *configure* —
you describe workflows, wire up 100 integrations, and watch digital signals.
Block is the opposite bet: **one URL, zero config, and true local grounding.**
It's the only one that answers "who is physically on my block, and are they a
rival or a partner?" — and it doesn't just draft; it owns the whole
send → follow-up → classify-reply loop from its own inbox. The human stays in
control (approve each draft; auto-reply is off by default), which is exactly the
line an agent acting on your behalf toward real third parties should respect.

## Stack, per sponsor

- **Convex** — the entire state machine: schema (businesses, leads, outreach,
  messages, activity) with per-purpose indexes, queries, mutations, Node actions,
  HTTP actions (the AgentMail webhook), the scheduler, crons (weekly rescan +
  follow-up sweep), realtime queries driving every part of the dashboard, Convex
  Auth (password), and `@convex-dev/static-hosting` serving the frontend from
  `convex.site`. Server-side ownership checks on every business-scoped function.
- **Firecrawl** — `@firecrawl/firecrawl-convex`: the user's own site + per-lead
  enrichment to markdown, with rate-limit backoff honoring the retry hint.
- **Google Places API (New)** — real nearby places by category/radius, so the
  LLM reasons over grounded facts instead of hallucinating.
- **AgentMail** — `@agentmail/convex`: a dedicated Block-branded inbox, per-lead
  threads, Svix-signed webhook ingest of inbound replies.
- **OpenAI** — `gpt-4o-mini` for profile extraction, relevance judgment, per-lead
  draft composition, and reply classification.
- React + Vite + TypeScript, shadcn/ui.

## Guardrails (deliberate)

- Replies land in AgentMail's inbox and surface on the dashboard — never routed
  to the owner's personal inbox.
- One follow-up per lead, professional tone — these are real businesses.
- Auto-reply to third parties is an explicit opt-in, **off by default**, with a
  1-hour grace window; the human stays in control.

**Live:** https://flippant-stork-696.convex.site
**Repo:** https://github.com/shwetd19/Convex-All-Gas
**Video:** https://www.youtube.com/watch?v=kHp2UfkJ9G8
