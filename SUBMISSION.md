# Sift — vibeapps submission draft

> Paste into the vibeapps form. Every number below is from a real run on the
> production deployment, not a mock.

**Tagline:** Forward job alerts. Get one ranked email back. Reply to steer the next one.

## The problem

You applied to forty jobs. Now every morning there are six alert emails from
LinkedIn, Naukri, Glassdoor, and company career pages, each one thirty links
of "you might also like". The thing you actually want — the two roles that
are remote, senior, and pay what you need — is in there somewhere. Nobody
opens thirty tabs. So the alerts get archived unread, and the good listing
goes with them.

Same shape for apartments, same shape for newsletters: a stream of
link-heavy emails where the signal-to-noise is terrible and the only way to
find the signal is to read everything.

## How it works

You forward the email to your Sift address with one line at the top:
`remote, senior, $150k+`. That's the whole interface.

- **It reads the email properly.** Marketing mail ships a plaintext part
  that is 12 KB of zero-width spam-filter padding with no links, while the
  real links live only in the HTML `href`s. Sift reads both. Then it drops
  the tracking noise — one LinkedIn application-confirmation email produced
  **28 URLs for 6 real postings** (a different `trackingId` for the logo,
  the title, and the Apply button of the same job) — by deduping on
  origin + path, and excludes social profiles, app-store links, and
  LinkedIn's navigation chrome before spending a single Firecrawl call.
- **Firecrawl scrapes each link** to markdown. Postings it can't reach
  (LinkedIn itself returns 403 to all scrapers) are marked failed and shown
  as such — the digest never pretends.
- **OpenAI extracts and scores.** Title, pay, location, a one-line summary,
  a category (jobs / flats / newsletter), and a 0–100 score against your
  note with a one-sentence reason — *and* against everything you've said in
  earlier replies (see below).
- **Convex batches it.** Every forward reschedules a 20-minute debounce
  for *you specifically* (`ctx.scheduler` cancel + reschedule, one
  `digestSchedule` row per forwarder). Six forwards in ten minutes produce
  one email, twenty minutes after the last one. Reply `now` — or click the
  button — and it goes immediately: measured **17 seconds** from the reply
  landing to the digest in the inbox.
- **AgentMail sends one ranked digest** back in the same thread, numbered,
  grouped by category, with the reason next to each score.
- **You reply to steer it.** `skip #2`, `more like #3`, `less like #1`, or
  plain English ("the Bentley one is too senior" — one small OpenAI call
  maps it onto the numbered list). Sift records the rule, confirms in-thread
  ("Skipping listings like #2 (Director, Software Engineering,
  jobs.bentley.com)"), and every future listing is scored with it in the
  prompt: a previously skipped URL scores 0–10, lookalikes by source /
  employer / role get nudged. The rules are visible on the dashboard and
  removable.

The dashboard is live throughout: a segmented progress bar for the batch in
flight, rows that flash as they move pending → scraping → ranked, a
per-second countdown to the next send, the digests that went out, and the
steering rules in effect.

## Why it's different

Most "email → LLM → email" demos are a single round trip. Sift's loop
closes: the digest is a numbered artifact you can talk back to, and what
you say changes the next ranking. The batching means you get *one* email
per session, not one per forward. And two people can share the inbox
without ever seeing each other's listings — the dashboard is scoped by
login, and the queue is scoped by who forwarded.

## Stack, per sponsor

- **Convex** — database (6 app tables + Convex Auth tables, 7 app indexes),
  queries, mutations, Node actions, HTTP actions (AgentMail webhook,
  auth routes, static site), crons (a 5-minute safety-net sweep), the
  scheduler for per-user debounce, realtime queries driving every part of
  the dashboard, Convex Auth (password), and three components:
  `@firecrawl/firecrawl-convex`, `@agentmail/convex` (plus its two
  workpools), `@convex-dev/static-hosting`. Frontend served from
  `convex.site`.
- **Firecrawl** — every listing page → markdown via the component's
  `scrape`.
- **AgentMail** — inbox identity, Svix-signed webhook ingest, threaded
  replies for digests and steering confirmations.
- **OpenAI** — `gpt-4o-mini` for field extraction + classification +
  scoring, digest composition, and reply-intent fallback.
- React 19, Vite, TypeScript.

## Things that bit

- `@agentmail/convex@0.1.0`'s component reads `AGENTMAIL_API_KEY` but never
  declares it in `defineComponent`, so the parent app has no supported way
  to grant it. Patched via `patch-package` (in `patches/`). Its
  `internalAction`s (`createInbox`, `listInboxes`) also can't be resolved
  from the parent app on Convex 1.45 — inbox provisioning goes through a
  small REST call instead; webhook ingest and threaded replies use the
  component as intended.
- A forwarded job alert's own subject line ("...Apply Now.", "...12 more
  jobs...") was being read as the user's "now" command and fired a digest
  before its links had finished scraping. Subjects are now only trusted as
  commands when they aren't a forward.
- The first version of login gated the dashboard but not the digest queue,
  so two accounts would have been batched into one email. Found by signing
  in with a second account; fixed by keying the schedule per forwarder.
- `@auth/core@0.41.1`, the version the Convex Auth docs point to, has a
  critical email-normalization bypass — relevant when access is matched by
  email. Bumped to 0.41.3.

## Verified on production

13 commits. End-to-end on the live deployment: forwarded real job-alert and
apartment emails → 17 listings scraped and ranked across 9 emails → digests
delivered in-thread (7 ranked jobs in one, with scores 50–85 and reasons) →
"now" reply to digest in 17 s → second account signs in and sees nothing
that isn't theirs. Parser for steering replies has 10 passing unit cases.

**Live:** https://flippant-stork-696.convex.site
**Repo:** https://github.com/shwetd19/Convex-All-Gas
**Video:** _(add link)_
