Good — locking this in for real. Here's the full build plan, incorporating the fixes from last message so it matches the pattern that's actually been winning.

## Product: **Block** — working name (a shop "owns its block"; short, easy to say in the demo)

*Drop your business link. The agent maps your real competitors, finds who's worth pitching nearby, reaches out on your behalf, and keeps working the leads — you just watch replies land.*

## Core agentic loop

```
User pastes their business URL/name
      ↓
Firecrawl scrapes the site (what they sell, price points, hours)
      ↓
OpenAI + nearby-places data identify real competitors/complements
      (judged by what they actually sell, not just category — reuse Sidewalk's insight here, it's the right call)
      ↓
Firecrawl enriches each competitor + nearby business/event contact (find work emails where public)
      ↓
Convex creates a "lead" record per contact — the standing job, not one-shot
      ↓
OpenAI drafts a personalized outreach email per lead (referencing something real: a gap, an event, a complement opportunity)
      ↓
User approves (batch or individually)
      ↓
AgentMail sends from its own inbox — NOT the user's personal inbox — tagged to that lead's thread
      ↓
Convex tracks each thread: sent → opened/replied → cold
      ↓
Cron: if no reply after N days, send one follow-up, then stop
      ↓
Inbound reply → OpenAI classifies (interested / not interested / needs info) → dashboard updates live
      ↓
Periodic rescan (weekly cron): check for new nearby competitors/events, surface new leads automatically
```

The **periodic rescan** is what turns this from a one-shot campaign into a standing job — the agent has something to do every week even with zero user input, which is exactly the "ongoing agent with a queue" pattern from Recourse/the CRM.

## Schema

- `businesses` — `{ userId, name, url, description, offerings, scrapedAt }`
- `leads` — `{ businessId, name, type: "competitor"|"complement"|"event"|"office", contactEmail, sourceUrl, relevanceNote, status: "sourced"|"approved"|"outreach_sent"|"replied"|"followed_up"|"cold"|"won" }`
- `outreach` — `{ leadId, threadId, draftText, sentAt, followUpSentAt, replyClassification, lastReplyAt }`
- `events` — timestamped log per lead for the live dashboard (sourced → drafted → sent → replied) — your live-demo money shot

## Sponsor stack — all load-bearing

| Sponsor | Role |
|---|---|
| Convex | business/lead/outreach state machine, weekly rescan cron, follow-up cron, live dashboard |
| Firecrawl | scrapes the user's own site, enriches each competitor/lead, finds contact emails |
| OpenAI | competitor/complement judgment, personalized draft per lead, reply classification |
| AgentMail | dedicated outbound inbox (not the user's personal one), per-lead threads, inbound reply capture |

## Build order

1. Business intake: URL → Firecrawl scrape → parsed profile. Get this solid first.
2. Competitor/lead sourcing: nearby-places lookup + Firecrawl enrichment + OpenAI relevance judgment.
3. Dashboard: leads list with status, live as they populate — this alone is demoable early, good checkpoint.
4. Draft generation + approval UI (batch approve is fine for v1).
5. AgentMail send + inbound reply capture, tied to `outreach` threads.
6. Follow-up cron (one follow-up, then stop).
7. Reply classification + live status updates.
8. Weekly rescan cron for new leads — do this last, it's the "wow, it keeps working" feature but not required for a functioning demo.
9. Demo polish: seed one real local business (yours or a friend's), show 3-4 real leads sourced, one getting a reply live on camera.

## Guardrails

- Replies stay in AgentMail's inbox and surface on the dashboard — never route to the user's personal inbox, that's what keeps this "agentic" instead of "just a mail merge."
- Cap to one follow-up per lead, keep tone professional not spammy — you're cold-emailing real businesses, this matters for demo credibility too.
- Start with a small fixed radius/area for sourcing so demo data is reliable.

Want me to write the full spec/prompt for your coding agent now, starting with phase 1 (business intake), or do you want it as one complete end-to-end spec to hand off in one go?



Here's the full plan again, with the data-source gap closed and a complete dashboard spec added.

## Product: **Block**

*Drop your business link. The agent maps your real competitors, finds who's worth pitching nearby, reaches out on your behalf, and keeps working the leads — you just watch replies land.*

## Addition 1: What you need alongside OpenAI for "nearby"

OpenAI has no real-time knowledge of what's physically near a given address — it will hallucinate plausible-sounding business names if you ask it cold. You need a real geo/places data source to ground it, then OpenAI reasons over that grounded data:

| Need | Tool | Why |
|---|---|---|
| Find real nearby businesses (competitors + complements) | **Google Places API (New)** | Returns actual nearby places by category/radius with names, categories, ratings — this is what Sidewalk itself uses, and it's the correct call |
| Judge rival vs. complement vs. noise | **Firecrawl scrapes each candidate's site + review pages** → **OpenAI reasons over that content** | Category alone is weak signal (e.g. a bakery and a coffee shop are both "food" but might be complements, not rivals) — reading actual menu/offerings text is what makes the judgment credible |
| Find nearby offices/companies worth pitching | **Google Places API (New)**, filtered to office/coworking/corporate categories | Same API, different place-type filter |
| Find nearby events/event organizers | **Luma, Eventbrite, and/or Meetup public APIs** | These are the standard sources for local event discovery — again, matches what Sidewalk used, and there's no reason to reinvent this |
| Find contact emails for sourced leads | **Firecrawl** (scrape contact/about pages) | Already in your stack, keep it doing this job — don't add a separate enrichment tool unless Firecrawl comes up empty often in testing |

So the actual pipeline for sourcing is: **Google Places (get real nearby entities) → Firecrawl (scrape each one for real content) → OpenAI (judge relevance/type from that content) → Firecrawl again (find contact email) → Convex (store as a lead)**. Events run a parallel branch: **Luma/Eventbrite/Meetup (get real nearby events) → OpenAI (score fit) → Convex**.

## Addition 2: Full dashboard spec

**Auth**
- Convex Auth, simplest viable option — email/password or magic link. No need for roles/teams for a hackathon; one account = one business is fine for v1.

**Onboarding (first-run flow)**
1. Landing screen: single input, "Paste your business URL."
2. Loading state while Firecrawl scrapes the site and Google Places resolves a location match — show real progress text ("Reading your site…", "Finding your location…").
3. Confirmation step: "Is this you?" showing the resolved business (name, address, category) — same pattern Sidewalk uses, it's good UX because it catches wrong matches before wasting a sourcing run.
4. On confirm, kick off the sourcing pipeline with a live progress view: "Scanning your block…" → "Found 14 nearby places…" → "Judging competitors vs. complements…" → "Found 3 events this week…" — this progress view is cheap to build and is a strong opening beat for the demo video.

**Main dashboard**
- Top summary bar: business name, and four live stat counters — *Leads sourced, Outreach sent, Replies received, Follow-ups pending.*
- Section tabs: **Competitors | Complements | Offices & Leads | Events | Activity**
- Each lead renders as a card/row: name, type badge, one-line relevance note ("why this matters" — e.g. "closed Sundays, you're open" or "hosting a 200-person event next week"), status badge (`sourced → approved → sent → replied → cold → won`), and a primary action button that changes with state (Approve outreach / View thread / Reply pending).
- All of this is Convex `useQuery` driven — no manual refresh, status badges visibly change color/animate the moment a cron or reply updates them. This live-update moment is your best demo asset, don't undersell it visually (subtle animation or highlight flash on state change is worth the extra hour).

**Lead detail / thread view**
- Click into any lead to see: the sourcing evidence (scraped snippet that justified including them), the drafted outreach email (editable before first send), then a running thread view styled like a compact inbox — sent message, reply (if any) with its OpenAI-classified label (`interested / not interested / needs info`) shown as a colored tag, and any follow-up sent.
- Controls here: Edit draft, Send now, and a manual "Send follow-up now" override sitting alongside the automatic cron-based one.

**Follow-ups**
- On each lead card/detail: a visible "Follow-up scheduled for [date/time]" countdown once outreach is sent and unanswered.
- When the cron fires, it logs to Activity and updates the card automatically — no page reload needed.
- One global setting: follow-up delay (default ~4 days), adjustable, applies to future sends.

**Activity feed** (its own tab/section)
- Reverse-chronological live log: "Sourced 5 new competitors," "Outreach sent to Corner Cafe," "Reply received from Joe's Deli — classified: interested," "Follow-up sent to Downtown Events." This is your terminal-style "watch the agent work" view — genuinely useful for the demo video as a single screen that tells the whole story without narration.

**Settings**
- Approval mode toggle: auto-send vs. approve-each (default to approve-each for the demo, so you control pacing on camera).
- Rescan toggle: weekly automatic re-sourcing on/off.
- AgentMail inbox connection status indicator.

Want me to now write this as the full end-to-end spec/prompt to hand your coding agent, or start it phase-by-phase with you reviewing each before moving on?