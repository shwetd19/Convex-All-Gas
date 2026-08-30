# Sift

You applied to 40 jobs. Every alert email is 30 links of noise.

Forward it to Sift. Every link gets scraped, scored against what you actually
want, and batched into one ranked email. Reply `skip #2` or `more like #3` to
steer the next one. Also works for apartments and newsletters.

Built for the Convex All Gas Hackathon. Live at
https://flippant-stork-696.convex.site — see [`hackathon.md`](./hackathon.md)
for the build log and [`PLAN.md`](./PLAN.md) for the original plan.

## How it works

1. You forward an email to your Sift inbox with a one-line note
   (`remote, senior, $150k+`).
2. **AgentMail** delivers it by webhook; Sift pulls every real link out of the
   text *and* HTML parts, drops tracking noise, dedupes by path.
3. **Firecrawl** scrapes each link to markdown.
4. **OpenAI** extracts title/price/location, classifies jobs/flats/newsletter,
   and scores 0–100 against your note — and against everything you've said in
   past replies.
5. **Convex** batches per forwarder with a 20-minute debounce (every new
   forward pushes the send out), keeps the dashboard live via reactive
   queries, and runs the safety-net cron.
6. **AgentMail** sends one ranked digest back in-thread. Reply to it and Sift
   records the steering, confirms, and applies it to the next batch.

## Stack

- [Convex](https://convex.dev) — database, queries/mutations/actions,
  scheduler, crons, HTTP actions, Convex Auth, static hosting
- [Firecrawl](https://firecrawl.dev) — `@firecrawl/firecrawl-convex`
- [AgentMail](https://agentmail.to) — `@agentmail/convex` (webhook ingest,
  threaded replies)
- [OpenAI](https://openai.com) — extraction, scoring, digest composition,
  reply intent
- React + Vite + TypeScript

## Development

```sh
npm install
npx convex dev   # backend
npm run dev      # frontend
npm run deploy   # build + deploy backend + upload static site
```

Env vars on the Convex deployment: `FIRECRAWL_API_KEY`, `AGENTMAIL_API_KEY`,
`AGENTMAIL_WEBHOOK_SECRET`, `OPENAI_API_KEY`, plus the ones
`npx @convex-dev/auth` sets.
