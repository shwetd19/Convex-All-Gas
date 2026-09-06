# Block

Your shop should own its block.

Paste your business URL. An AI agent maps your real local competitors,
complements, nearby offices, and prospective customers — grounded in Google
Places and startup directories, not guesses — drafts a personalized outreach
email for each, and works the leads from its own inbox: sending, following up,
and classifying replies while you just watch them land.

Built for the Convex All Gas Hackathon. Live at
https://flippant-stork-696.convex.site — see [`hackathon.md`](./hackathon.md)
for the build log and [`PLAN.md`](./PLAN.md) for the plan.

## How it works

1. **Paste one URL.** Firecrawl scrapes your site; OpenAI reads it for what you
   actually sell, your category, and location. You confirm "Is this you?"
2. **The agent maps your block.** Google Places (New) finds *real* nearby
   competitors, complements, and offices; startup/B2B directories (Y Combinator,
   Product Hunt, Wellfound, Clutch, F6S) surface prospective customers. OpenAI
   judges each candidate by its actual offerings — rival vs. complement vs.
   noise — not by category label. A two-tier triage stores every lead, then
   deep-enriches the top-scored within a hard 5-minute scan budget.
3. **It drafts outreach per lead.** OpenAI writes a personalized email that
   references something real about each lead.
4. **You approve.** Review and edit each draft in-app before anything sends.
5. **AgentMail sends from its own inbox** (`block@agentmail.to`) — never your
   personal inbox — with one thread per lead.
6. **It follows up and handles replies.** One automatic follow-up after N days
   (default 2), then it stops. An inbound reply is classified by OpenAI
   (interested / not interested / needs info), you're emailed, and — only if you
   opt in — the agent can auto-reply after a 1-hour grace window.
7. **It keeps working.** A weekly rescan cron surfaces new nearby leads with zero
   input, turning a one-shot campaign into a standing job.

Everything is a live Convex query — the dashboard, scan progress, lead statuses,
and threads update in real time as the agent works.

## Stack, per sponsor

- **[Convex](https://convex.dev)** — the whole state machine: schema + indexes
  for businesses / leads / outreach / messages / activity, queries, mutations,
  Node actions, HTTP actions (the AgentMail webhook), the scheduler, crons
  (weekly rescan + follow-up sweep), realtime queries driving the entire UI,
  Convex Auth, and static hosting via `@convex-dev/static-hosting`.
- **[Firecrawl](https://firecrawl.dev)** — `@firecrawl/firecrawl-convex`: scrapes
  the user's own site and enriches each lead / directory profile to find contact
  emails, with rate-limit backoff.
- **[Google Places API (New)](https://developers.google.com/maps/documentation/places/web-service)**
  — grounds sourcing in real nearby businesses so the agent reasons over facts,
  not hallucinations.
- **[AgentMail](https://agentmail.to)** — `@agentmail/convex`: a dedicated
  Block-branded outbound inbox, per-lead threads, Svix-signed webhook ingest of
  inbound replies.
- **[OpenAI](https://openai.com)** — `gpt-4o-mini` for profile extraction,
  relevance judgment, per-lead draft composition, and reply classification.
- React + Vite + TypeScript, shadcn/ui.

## Development

```sh
npm install
npx convex dev   # backend
npm run dev      # frontend
npm run deploy   # build + deploy backend + upload static site
```

Env vars on the Convex deployment: `FIRECRAWL_API_KEY`, `GOOGLE_PLACES_API_KEY`,
`AGENTMAIL_API_KEY`, `AGENTMAIL_WEBHOOK_SECRET`, `OPENAI_API_KEY`, plus the ones
`npx @convex-dev/auth` sets.
