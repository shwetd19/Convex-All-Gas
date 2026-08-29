# Hackathon log

- **Project:** Listing Digest
- **Event:** Convex All Gas Hackathon
- **What it does:** Forward a listing email (apartments, jobs, events) with a preference note; it scrapes and ranks the links live, then emails back a digest.
- **Live app:** not deployed
- **Repo:** https://github.com/shwetd19/Convex-All-Gas
- **Frontend:** Convex static hosting
- **Convex deployment:** https://wandering-bloodhound-586.convex.cloud (dev)
- **Components:** @agentmail/convex, @firecrawl/firecrawl-convex
- **Convex features:** schema, indexes, queries, mutations, actions, internal functions, HTTP actions, crons, realtime queries
- **Auth:** none
- **AI models:** gpt-4o-mini
- **Started:** 2026-08-27T11:01:54Z
- **Last updated:** 2026-08-28T20:38:28Z

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
`listings` row, and a digest reply sent back through AgentMail.
