# new_plan.md — Block, from hackathon demo to real product

A prioritized roadmap written as if Block were a real startup onboarding real business owners — not a demo. It folds in two inputs: a competitive read of Rilo (getrilo.ai), and a production-readiness review focused on trust, safety, and deliverability. Updated 2026-09-06.

The organizing principle: **Block sends real correspondence to real third parties under a real business's name.** That single fact is what separates the "can't ship without it" work from the "makes it better" work. Everything is ranked against it.

---

## 0. Where Block is today (honest baseline)

Already built and live (https://flippant-stork-696.convex.site):

- Paste-URL intake → Firecrawl scrape → OpenAI profile → "Is this you?" confirm.
- Grounded sourcing: Google Places (New) + startup/B2B directories (YC, Product
  Hunt, Wellfound, Clutch, F6S), OpenAI relevance judgment, two-tier triage →
  enrichment inside a hard 5-minute scan budget.
- Per-lead personalized drafts; **approve-each** by default (`approvalMode`),
  send from a dedicated AgentMail inbox (`block@agentmail.to`), per-lead threads.
- One automatic follow-up after N days (default 2), then stop.
- Inbound reply → OpenAI classification (interested / not / needs info) → owner
  emailed → optional agent auto-reply after a 1-hour grace (`autoReply`, **off
  by default**).
- Weekly rescan cron. Multi-business per account with server-side ownership.
- Shared read-only **demo workspace** (Convex, seeded) so every new user lands
  on a populated Block. Setup/scanning flow hardened (locked nav during setup,
  clear scanning states).

What this baseline is **not** yet: a system safe to let strangers self-serve.
The gaps below are why.

---

## Competitive frame (one paragraph)

Rilo (now joining Adobe) is a horizontal "AI GTM platform you configure" for
funded startups — you build workflows, wire 100+ integrations, watch digital
signals. Block's edge is the opposite: **local, grounded, zero-config**, and it
owns the full send→follow-up→reply loop rather than just drafting. The roadmap
below protects that edge (don't become a worse Rilo) while closing the
production gaps that any real outreach product must close.

Effort key: **S** ≈ <1 day · **M** ≈ 2–4 days · **L** ≈ 1–2 weeks.

---

## Tier 1 — Cannot onboard real users without these (trust, safety, legal)

These are not optimizations. Shipping self-serve signup without them risks
domain blacklisting, spam folders, and legal exposure.

### 1.1 Email deliverability infrastructure — **L** · *highest priority*
Cold outreach at volume dies silently in spam without proper sending-domain
setup. Today all mail sends from one shared `block@agentmail.to` inbox — fine
for a demo, dangerous for a product (one user's bad behavior poisons everyone's
deliverability).
- SPF / DKIM / DMARC aligned on the sending domain(s).
- Domain warm-up (ramp send volume gradually on new domains).
- Per-domain / per-tenant send-rate limits.
- Decide the model: a well-warmed shared Block domain with strict per-tenant
  caps, vs. per-customer sending domains (better reputation isolation, more
  setup). Confirm exactly what AgentMail handles vs. what Block must own.
- *Convex fit:* rate-limit sends with `@convex-dev/rate-limiter` instead of
  hand-rolled counters; the scheduler already spaces sends.

### 1.2 CAN-SPAM / opt-out compliance — **M** · *legal, do with 1.1*
- A real unsubscribe mechanism in every outbound email.
- A **suppression list**, honored permanently and globally (once someone opts
  out, no lead row for them is ever contacted again, across rescans).
- Physical mailing address + clear sender identity in the footer (CAN-SPAM).
- *Schema:* add a `suppressions` table (email/domain) checked before every
  `sendOutreach` / `sendFollowUp` / auto-reply.

### 1.3 Auto-send probation for new users — **S**
Auto-send (`approvalMode: "auto_send"`) and `autoReply` are opt-in — good. But
force **approve-each for a new account's first N sends regardless of setting**,
so nobody's first-ever experience is an unreviewed email going to a stranger
under their business's name. A per-account `sendsApproved` counter gates it.

### 1.4 Guardrails on what the agent can claim — **M**
A drafting-prompt review pass so drafts never: assert unverifiable facts about a
competitor, make pricing/availability promises the owner hasn't approved, or
imply a relationship that doesn't exist. Add a lightweight post-generation
check (a second cheap OpenAI pass or rules) that flags risky claims before a
draft is marked ready.

### 1.5 Terms of service + agent-sent disclosure — **S** (writing, not code)
Before self-serve signup: ToS covering that outreach is agent-sent on the
owner's behalf, acceptable-use (no harassment/spam), and a disclosure line in
outreach that a human can reasonably tell it's automated. This is reputational
and legal weight, not a nicety.

---

## Tier 2 — Needed for a self-serve SaaS (not just a working demo)

### 2.1 Billing + hard usage caps — **L** · *do right after Tier 1*
Every scan costs OpenAI + Firecrawl + Places money. Without server-side caps,
one enthusiastic user runs up a bill you didn't price. You cannot safely let
strangers sign up without this.
- Stripe checkout + metered/tiered plans via **`@convex-dev/stripe`**
  (webhook-verified, server-side gating).
- Hard per-tier caps enforced in the pipeline: businesses/account, scans/month,
  leads/scan, sends/day. Refuse over-cap server-side, surface it in the UI.

### 2.2 Bounce & contact-validation handling — **M**
Scraped emails are often stale or generic (`info@`). Detect bounces (AgentMail
webhook), mark the lead's contact dead, don't burn a follow-up on it, and
prefer role-based fallbacks intelligently. Add lightweight syntax/MX validation
before the first send.

### 2.3 Safe onboarding funnel — **S–M** (partly done)
The shared demo workspace already lets a new user see Block populated before
touching their reputation. Finish the funnel: a **"Try the demo" / guest entry
on the sign-in screen** so judges and prospects see the populated dashboard
*before* creating an account — the biggest conversion lever we identified.

### 2.4 Observability beyond the happy path — **M**
Failed scrapes, API quota hits (429s), and send failures need visible status,
not silent drops. Surface them in Activity and a per-business health strip, so
support isn't "why didn't anything happen" with nothing to diagnose.
- *Convex fit:* the app already logs to `activity`; add explicit failure kinds
  and a health summary query. Consider the Convex insights/advisor tooling for
  backend-side error visibility.

### 2.5 Audit trail — **S–M**
Log every agent action — especially auto-replies — with who/what/when. Matters
for the owner's trust and for Block's liability if something goes wrong
downstream. Extend `messages`/`activity` into an append-only, queryable record.

---

## Tier 3 — What earns repeat payment (retention & ROI)

### 3.1 Pipeline / CRM view — **M**
Kanban stages (sourced → contacted → replied → won/lost) instead of only a card
grid, once volume outgrows the grid. The `leads.status` lifecycle already
models these stages — this is mostly a view.

### 3.2 ROI analytics — **M**
Reply rate, conversion rate, leads worked this month, estimated hours saved.
This is what makes a small-business renewal a no-brainer instead of a
vibes-based decision. Computed from `outreach`/`messages`.

### 3.3 Custom tone/voice per business — **S–M**
Let the owner supply example emails or a tone preference; feed it into the
drafting prompt so mail sounds like them, not a template. Directly moves reply
rate — Block's core value metric. (`businesses.notes` is a start; add a
`voiceSample`.)

### 3.4 Calendar booking link — **S**
When a lead is interested, drop a real scheduling link (Calendly-style) instead
of proposing a time in prose. Converts far better; a per-business setting.

### 3.5 Team / multi-user — **L**
Even small businesses have a partner or employee who wants visibility or
approval rights. Add org/membership on top of the current single-owner model.
Caps growth if left out.

### 3.6 Exports & integrations — **M**
CSV export first (cheap, high-ask), then a lightweight CRM sync / Zapier for
users who won't abandon their existing tool.

---

## Borrowed from Rilo (fits Block, low effort — slot into Tier 2/3)

- **Weekly digest email** — **S.** Reuses the rescan cron + owner-email
  plumbing: "3 new leads on your block, 2 replies, 1 event nearby." The one
  thing polished competitors do that Block doesn't.
- **"Signal" chips on lead cards** — **S.** Surface the relevance note as a
  first-class colored chip so value reads at a glance. UI relabel of existing
  data.
- **Deliberately skip:** the conversational workflow builder, content
  distribution, call-transcript analysis, investor tracking — all off-axis for
  a local business owner and contrary to Block's zero-config bet.

---

## Recommended sequence

1. **Now (housekeeping):** remove the stray `codex` tag from the live vibeapps
   submission; finish the "Try the demo" guest entry (2.3).
2. **Phase 1 — make it safe to send (Tier 1):** deliverability (1.1) + opt-out/
   suppression (1.2) together, then auto-send probation (1.3), claim guardrails
   (1.4), ToS/disclosure (1.5). *Nothing self-serve ships before this.*
3. **Phase 2 — make it safe to sign up (Tier 2):** billing + caps (2.1), then
   bounce handling (2.2), observability (2.4), audit trail (2.5). Slot the
   weekly digest in here (cheap, high perceived value).
4. **Phase 3 — make it worth paying for (Tier 3):** ROI analytics (3.2) and
   custom voice (3.3) first (they move the core metric and the renewal
   decision), then pipeline view, calendar, teams, exports.

**One-line summary:** deliverability + compliance are the line between "could
blacklist a domain or create legal exposure" and "a real product"; billing +
caps are the line between "demo" and "safe to let strangers sign up." Do those
two blocks first — everything else is optimization on top of a product that is
actually safe to run.








### LEFT 

### 1.1 Email deliverability infrastructure — **L** · 🔜 highest priority
Today all mail sends from one shared `block@agentmail.to` inbox — fine for a
demo, dangerous at volume (one bad actor poisons everyone's reputation).
- SPF / DKIM / DMARC aligned on the sending domain(s); domain warm-up;
  per-tenant send-rate limits.
- Decide the model: warmed shared Block domain + strict per-tenant caps vs.
  per-customer sending domains (better isolation, more setup). Confirm what
  AgentMail handles vs. what Block owns.
- *Convex fit:* rate-limit sends with **`@convex-dev/rate-limiter`** instead of
  hand-rolled counters; the scheduler already spaces sends. (The 20-email cap
  above is the account-level version of this; 1.1 is the per-domain/day layer.)