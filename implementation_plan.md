# implementation_plan.md — Block

A concrete, buildable plan for taking Block from hackathon demo to a product
real business owners can sign up for. This is the *how* (files, schema,
Convex components, effort, status); `new_plan.md` is the *why/priority*.

Status legend: ✅ done · 🔜 next · ⬜ planned.
Effort: **S** ≈ <1 day · **M** ≈ 2–4 days · **L** ≈ 1–2 weeks.

---

## ✅ Done — free-tier hard caps

Per-account guardrails, enforced server-side (the shared demo is excluded from
both counts). Over the limit, the user gets a clear message to contact the org
at **shwetasdhake16@gmail.com**.

- **Max 3 businesses / account** — `businesses.create` calls
  `countOwnBusinesses`; over the cap it throws `businessLimitMessage` (shown in
  the onboarding error).
- **Max 20 outreach emails / account** — metered on initial sends
  (`outreach.sentAt`):
  - `leads.approve` refuses once the account is at 20.
  - `leads.approveAll` only fills the remaining allowance.
  - `pipeline.sendOutreach` has a backstop for the auto-send path — over the
    cap it logs a held-send activity line and skips, so nothing sends past 20
    even without a user click.
- New `convex/limits.ts` holds the constants (`MAX_BUSINESSES`,
  `MAX_OUTREACH_EMAILS`, `LIMIT_CONTACT_EMAIL`), the counting helpers, and the
  `sentCountForBusinessOwner` internal query used by the pipeline.

---

## Tier 1 — Cannot onboard real users without these

### 1.2 CAN-SPAM / opt-out compliance — **M** · ⬜ *do with 1.1*
- A real unsubscribe mechanism in every outbound email.
- A **suppression list**, honored permanently and globally — once someone opts out, no lead row for them is ever contacted again, across rescans.
- Physical mailing address + clear sender identity in the footer (CAN-SPAM).
- *Schema:* add a `suppressions` table (by email + by domain), checked in `sendOutreach` / `sendFollowUp` / `sendAutoReply` before every send. Wire an
  unsubscribe link → public HTTP action that inserts the suppression.

### 1.3 Auto-send probation for new users — **S** · ⬜
Auto-send (`approvalMode: "auto_send"`) and `autoReply` are opt-in — good. Force
**approve-each for a new account's first N sends regardless of setting**, so
nobody's first experience is an unreviewed email to a stranger under their
business's name.
- *Schema:* `sendsApproved` counter on the account (or derive from sent count).
  In `generateDraft`'s auto-send branch, require count ≥ N before honoring
  auto_send.

### 1.4 Guardrails on what the agent can claim — **M** · ⬜
Drafts must never assert unverifiable facts about a competitor, promise pricing/
availability the owner hasn't approved, or imply a relationship that doesn't
exist.
- Harden the `generateDraft` system prompt with explicit "never claim" rules.
- Add a lightweight post-generation check (cheap second OpenAI pass or a
  rules/regex scan) that flags risky claims and marks the draft
  `needs_review` instead of `ready`.

### 1.5 Terms of service + agent-sent disclosure — **S** (writing, not code) · ⬜
Before self-serve signup: ToS (outreach is agent-sent on the owner's behalf,
acceptable-use / no harassment or spam) and a disclosure line in outreach a
human can reasonably read as automated. Reputational + legal weight.

---

## Tier 2 — Needed for a self-serve SaaS

### 2.2 Bounce & contact-validation handling — **M** · ⬜
Scraped emails are often stale or generic (`info@`).
- Detect bounces via the AgentMail webhook (`convex/http.ts` + `email.ts`);
  mark the lead's contact dead (`contactStatus: "bounced"`), don't burn a follow-up on it.
- Lightweight syntax/MX validation before the first send; prefer role-based
  fallbacks intelligently.

### 2.4 Observability beyond the happy path — **M** · ⬜
Failed scrapes, API quota hits (429s), and send failures need visible status, not silent drops.
- *Convex fit:* the app already logs to `activity`; add explicit failure kinds
  (`scrape_failed`, `quota_hit`, `send_failed`) and a per-business health
  summary query surfaced as a status strip. Use Convex insights/advisor for
  backend-side error visibility.

### 2.5 Audit trail — **S–M** · ⬜
Log every agent action — especially auto-replies — with who/what/when.
- Extend `messages`/`activity` into an append-only, queryable record (actor:
  owner vs. agent; action; timestamp). Matters for owner trust and Block's
  liability.

---

## Tier 3 — What earns repeat payment

### 3.1 Pipeline / CRM view — **M** · ⬜
Kanban stages (sourced → contacted → replied → won/lost) instead of only a card
grid. The `leads.status` lifecycle already models these — mostly a view.

### 3.2 ROI analytics — **M** · ⬜
Reply rate, conversion rate, leads worked this month, estimated hours saved —
computed from `outreach`/`messages`. Makes a renewal a no-brainer.

### 3.4 Calendar booking link — **S** · ⬜
When a lead is interested, drop a real scheduling link (Calendly-style) instead
of proposing a time in prose. Per-business setting fed into drafts and replies.

### 3.5 Team / multi-user — **L** · ⬜
Org/membership on top of the current single-owner model (visibility + approval
rights for a partner/employee). Caps growth if left out.

### 3.6 Exports & integrations — **M** · ⬜
CSV export first (cheap, high-ask), then a lightweight CRM sync / Zapier for
users who won't abandon their existing tool.

---

## Low-effort wins (slot in anywhere)

- **Weekly digest email** — **S** · ⬜ Reuses the rescan cron + owner-email
  plumbing: "3 new leads on your block, 2 replies, 1 event nearby." The one
  thing polished competitors do that Block doesn't.
- **"Signal" chips on lead cards** — **S** · ⬜ Surface the relevance note as a
  first-class colored chip so value reads at a glance. UI relabel of existing
  data.

---

## What to adopt after studying AiSDR & Aura

Two adjacent products, read for what Block should borrow (and deliberately not).

**AiSDR** (aisdr.com) — "Send deeply researched, high-converting sales
outreach." AI agent "Ami," quality-over-volume, deep per-lead research,
multi-channel sequences, deliverability tech, reply qualification, meeting
booking, HubSpot/Salesforce sync, real-time analytics. ~$900/mo.

**Aura** (auragtm.ai) — "Outbound that runs itself." Autonomous outbound for
solo founders / early startups; generates positioning, outreach, and competitor
insights and *executes*, not just plans.

Improvements for Block, ranked:

1. **Lean into "quality over volume" — the 20-email cap is a feature, not just a
   limit.** AiSDR's whole pitch is that blasting volume is the problem. Frame
   Block's cap and its grounded, "only reach out with a real reason" sourcing as
   deliberate anti-spam quality — it's a narrative *and* a trust signal. **S.**
2. **Deeper per-lead research before drafting.** AiSDR reads LinkedIn posts +
   company news; Block reads the site + a relevance note. Add one more research
   signal (recent news / a second page) into `generateDraft` — the single
   biggest lever on reply rate, Block's core metric. **M.** (pairs with 3.3
   custom voice.)
3. **Meeting booking, not "let's find a time" prose.** Both imply conversion is
   the goal; a real scheduling link converts far better. = 3.4. **S.**
4. **Reply qualification / objection handling in auto-reply.** AiSDR handles
   objections + FAQs before human handoff. Block classifies replies; extend the
   (opt-in, guardrailed) auto-reply to answer common objections and offer the
   booking link. **M.**
5. **Real-time ROI analytics as a headline surface.** AiSDR shows live reply
   rate / meetings / influenced pipeline. = 3.2 — treat it as a first-class
   page, not an afterthought. **M.**
6. **Deliverability as a headline capability.** AiSDR sells "patented
   deliverability." = 1.1 — and worth saying out loud in the product. **L.**
7. **A light "competitor insights" digest.** Aura generates competitor insights;
   Block already sources competitors — fold a "what's new with your competitors"
   line into the weekly digest. Cheap, on-brand, local. **S–M.**

**Deliberately skip:** multi-channel LinkedIn/phone sequences and GTM
content generation (AiSDR/Aura territory) — off-axis for a local business owner
and against Block's zero-config, local-first bet. Block wins by being the
grounded, quality-capped, works-your-block agent, not a general SDR platform.

**Where to start:** #1 (framing, ~free) and #3 (booking link, S) now; #2 (deeper
research) next since it moves reply rate most; then Tier 1 deliverability +
compliance before any real self-serve signup.
