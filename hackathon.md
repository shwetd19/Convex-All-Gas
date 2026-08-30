# Hackathon log

- **Project:** Sift (formerly Listing Digest)
- **Event:** Convex All Gas Hackathon
- **What it does:** Forward job alerts (or apartment listings, newsletters) with a one-line note of what you want; every link is scraped, scored, and batched into one ranked email — then reply "skip #2" / "more like #3" to steer how the next batch is ranked.
- **Demo video:** not recorded yet
- **Live app:** https://flippant-stork-696.convex.site
- **Repo:** https://github.com/shwetd19/Convex-All-Gas
- **Frontend:** Convex static hosting
- **Convex deployment:** https://flippant-stork-696.convex.cloud
- **Components:** @agentmail/convex, @firecrawl/firecrawl-convex, @convex-dev/static-hosting
- **Convex features:** schema, indexes, queries, mutations, actions, internal functions, HTTP actions, crons, scheduled functions (cancel + reschedule), realtime queries, Convex Auth
- **Auth:** Convex Auth
- **AI models:** gpt-4o-mini
- **Started:** 2026-08-27T11:01:54Z
- **Last updated:** 2026-08-30T16:26:54Z

## Log

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
