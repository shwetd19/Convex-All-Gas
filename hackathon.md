# Hackathon log

- **Project:** Listing Digest
- **Event:** Convex All Gas Hackathon
- **What it does:** Forward listing emails (apartments, jobs, newsletters) with a preference note; it scrapes and ranks the links live, then batches everything into one categorized digest reply — immediately on request ("digest now" / "jobs now"), or after a quiet period.
- **Live app:** https://flippant-stork-696.convex.site
- **Repo:** https://github.com/shwetd19/Convex-All-Gas
- **Frontend:** Convex static hosting
- **Convex deployment:** https://flippant-stork-696.convex.cloud
- **Components:** @agentmail/convex, @firecrawl/firecrawl-convex, @convex-dev/static-hosting
- **Convex features:** schema, indexes, queries, mutations, actions, internal functions, HTTP actions, crons, scheduled functions, realtime queries
- **Auth:** none
- **AI models:** gpt-4o-mini
- **Started:** 2026-08-27T11:01:54Z
- **Last updated:** 2026-08-29T11:08:47Z

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
