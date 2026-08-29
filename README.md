# Listing Digest

Forward listing emails (apartments, jobs, events), get a ranked, live-updating
digest, get an email back. Built for the Convex All Gas Hackathon.

See [`PLAN.md`](./PLAN.md) for the build plan and [`hackathon.md`](./hackathon.md)
for the build log.

## Stack

- [Convex](https://convex.dev) — backend, schema, reactive queries, crons
- [Firecrawl](https://firecrawl.dev) — scrape listing URLs to clean markdown
- [AgentMail](https://agentmail.to) — inbound listing forwards, outbound digest replies
- [OpenAI](https://openai.com) — field extraction, preference scoring, digest composition
- React + Vite + TypeScript — frontend

## Development

```sh
npm install
npx convex dev   # in one terminal
npm run dev      # in another
```
