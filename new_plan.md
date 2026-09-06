# new_plan.md — Rilo (getrilo.ai) vs. Block

A line-by-line read of what **Rilo** does, honestly compared against what **Block**
(this repo) does today, and what's worth borrowing. Written 2026-09-04.

> Note on Rilo's status: their site currently says *"Rilo is joining Adobe."*
> So this isn't "a competitor to beat in market" — it's a reference design for a
> category (AI GTM agents) that just got validated by an acquisition. We're
> reading it to learn, not to chase.

---

## 1. What Rilo is, in one line

> "Your GTM team just got bigger. Without the headcount."
> "Rilo's AI agents own outcomes, not just tasks."

Rilo is a **general-purpose GTM (go-to-market) automation platform**. You describe
an outcome, it builds a workflow of AI agents that continuously monitor sources,
detect signals, and deliver drafts/insights to Slack or email for a human to
approve. It is horizontal (many use-cases, 100+ integrations), aimed at founders
and early GTM teams.

Block is a **narrow, vertical agent for a local business**: paste one URL, and it
maps who is physically and commercially near you, then runs personalized outreach
end-to-end from its own inbox. It is zero-config and aimed at a shop owner, not a
GTM professional.

Different shapes. Rilo is a *platform you configure*. Block is a *product that just
works*. That distinction is the whole strategic story below.

---

## 2. What Rilo does, feature by feature

| # | Rilo feature | Exact phrasing |
|---|---|---|
| 1 | **Competitor intelligence** | "Daily digest of competitor launches, reviews, posts and hiring signals. Ranked by relevance and delivered to Slack or email." |
| 2 | **Prospect signal detection** | "Rilo tracks funding, hiring spikes and pain signals across your ICP" → triggers prospect identification + draft emails |
| 3 | **Investor tracking** | Monitors target VCs/angels across Twitter, blogs, podcasts, portfolio news for timing insights |
| 4 | **Content distribution** | "Write one post. Show up on five platforms." Adapts a post/blog/transcript into platform-native drafts and queues them |
| 5 | **Custom workflow builder** | "Just tell Rilo what you need. It asks the right questions, understands the outcome you want, and builds the workflow live in minutes." |
| 6 | **Lead enrichment** | Auto-enriches leads, qualifies inbound interest, pushes structured data to CRM |
| 7 | **Call transcript analysis** | Surfaces objections, buying signals, product feedback from calls automatically |
| 8 | **Market monitoring** | Tracks product conversations across support channels, Slack, communities |
| — | **Integrations** | 100+: Reddit, Gmail, Twitter, LinkedIn, Facebook, Notion, Zapier, HubSpot, Apollo, Slack, Instantly, Salesforce |
| — | **Delivery / HITL** | Digests to Slack/email; drafts queued for the team to "review and approve before action" |
| — | **Pricing** | Free tier, first workflow free, no credit card |

**How Rilo works (their stated flow):**
1. Pick a pre-built template *or* describe your outcome in natural language
2. Rilo configures the workflow automatically ("it knows what done looks like")
3. It monitors the specified sources continuously
4. Triggers fire on conditions (funding, hiring spike, product launch)
5. Structured insights + draft outputs land in Slack/email
6. Human reviews & approves before anything is sent

---

## 3. What Block does today (this repo)

- **Intake:** paste business URL → Firecrawl scrape → OpenAI parses name / offerings /
  category / location → "Is this you?" confirm step.
- **Grounded sourcing:** Google Places (New) finds *real* nearby competitors,
  complements, offices; startup/B2B directories (YC, Product Hunt, Wellfound,
  Clutch, F6S) source prospective customers; OpenAI judges relevance from actual
  scraped content, not category guesses. Two-tier triage → deep enrichment inside
  a hard 5-minute scan budget.
- **Outreach loop, owned end-to-end:** OpenAI drafts a personalized email per lead →
  owner approves (per-lead, in a modal) → **AgentMail** sends from a dedicated
  `block@agentmail.to` inbox (never the owner's personal inbox) → per-lead threads.
- **Follow-ups:** one automatic follow-up after N days (default 2), then stop.
- **Replies:** inbound reply → OpenAI classifies (interested / not / needs info) →
  owner is emailed → 1-hour grace window → optional auto-reply (explicit opt-in,
  **off by default**).
- **Standing job:** weekly rescan cron surfaces new nearby leads with zero input.
- **UI:** shadcn/ui SaaS dashboard, live scan progress, in-app thread view,
  Settings, Contact.
- **Stack:** Convex (state machine, crons, live queries, hosting) · Firecrawl ·
  OpenAI (gpt-4o-mini) · Google Places · AgentMail.

---

## 4. What Rilo has that Block does NOT

Honest gaps. Ranked by how much they'd matter to Block's actual user.

1. **Conversational workflow builder.** Rilo's headline differentiator — "tell it
   what you want." Block has exactly one hard-coded workflow. This is Rilo's moat
   and also its complexity tax.
2. **Multiple signal types beyond geography.** Rilo watches funding rounds, hiring
   spikes, competitor launches, review activity, investor moves. Block only knows
   "who is near you." Block has no *temporal signal* concept — it's a snapshot +
   weekly rescan, not an event stream.
3. **Content distribution.** Repurpose one post into five platform-native drafts.
   Block does no content/marketing output at all.
4. **Call transcript analysis.** Entirely absent from Block.
5. **Broad integrations (100+).** Block writes to nothing external except AgentMail.
   No CRM push (HubSpot/Salesforce), no Slack delivery, no Apollo/Instantly.
6. **Slack/email digest delivery.** Block keeps everything in-app + owner email on
   reply. Rilo meets teams where they already work (Slack).
7. **Explicit "template gallery" onboarding.** Rilo offers pre-built starting
   points; Block has one path.

## 5. What Block has that Rilo does NOT (our edge — protect this)

1. **True local/geo grounding.** Rilo watches *online/digital* signals. Block is the
   only one that answers "who is physically on my block, and are they a rival or a
   partner?" via Google Places + content-level judgment. Rilo can't do the corner
   café / neighboring office / this-week's-local-event use case.
2. **Zero configuration.** Block's user pastes one URL and is done. Rilo's user has
   to *think in workflows*. For a non-technical local shop owner, Block's floor is
   far lower. Rilo's power is a barrier; Block's simplicity is a feature.
3. **Owns the full outreach loop with its own identity.** Block sends from a
   dedicated inbox, threads every lead, classifies replies, follows up, and can
   auto-reply. Rilo mostly *drafts and queues* — the human still runs the send/reply
   loop. Block goes further down the "agent actually does it" path.
4. **Vertical fit for SMB / local, not GTM teams.** Rilo targets funded startups with
   ICPs and runway. Block targets the dry cleaner, the gym, the studio — a market
   Rilo explicitly isn't built for.

---

## 6. What's worth borrowing (prioritized, honest about effort)

**Adopt — high value, fits Block's shape:**

- **Slack/email digest delivery.** Block already emails the owner on a reply. Extend
  that into an optional **weekly digest**: "5 new leads on your block, 2 replies, 1
  event next week." Reuses the existing rescan cron + owner-email plumbing. Cheap,
  high perceived value, and it's the single thing Rilo does that Block's user would
  most obviously want. *Effort: low.*
- **Named "signal" framing in the UI.** Rilo sells *signals* ("hiring spike",
  "funding"). Block already computes relevance notes ("closed Sundays, you're open";
  "hosting a 200-person event"). Surface those as first-class **signal chips** on
  each lead so the value reads instantly. Mostly a UI relabel of data we have.
  *Effort: low.*

**Consider — real value but real scope:**

- **A second temporal signal source.** Block is geo-static. Adding *one* event/timing
  signal (e.g. a local-events branch already sketched in PLAN.md via Luma/Eventbrite/
  Meetup) would give Block its own "signal fires → draft outreach" moment, matching
  Rilo's most compelling behavior while staying local. *Effort: medium.* Pick ONE
  source and demo it deeply — don't sprawl.
- **CRM/Slack push (one integration, not 100).** If Block ever leaves the demo,
  pushing won/interested leads to *one* CRM or a Slack channel is the highest-signal
  integration. Skip the 100-integration arms race. *Effort: medium.*

**Deliberately DON'T copy:**

- The **conversational workflow builder.** It's Rilo's identity, but it directly
  contradicts Block's "paste one URL, zero config" advantage. Building it would turn
  Block into a worse, more complex Rilo. Stay narrow and opinionated.
- **Content distribution, call-transcript analysis, investor tracking.** All off-axis
  for a local business owner. Ignore.

---

## 7. One-sentence positioning takeaway

Rilo is **"an AI GTM team you configure"** for funded startups; Block is
**"an AI business-development rep that just works"** for the local business that has
no GTM team at all. The winning move isn't to become Rilo — it's to be the thing
Rilo was never built to be: **local, grounded, and zero-config**, borrowing only its
best delivery habits (digests, signal framing) without inheriting its complexity.
