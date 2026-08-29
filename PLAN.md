# Listing Digest — Build Plan

Forward listings, get a ranked, live-updating digest, get an email back.

## 1. Core user flow

1. User gets a dedicated inbox address (e.g. `you@yourapp.agentmail.to`) on signup.
2. User forwards emails containing listing links (apartments, jobs, events — whatever they're hunting for) to that address, plus a one-line preference note ("under $2500, 2BR, near downtown").
3. Backend detects new mail → extracts URLs → Firecrawl scrapes each listing → OpenAI extracts structured fields + scores against stated preferences.
4. A live dashboard shows each listing appear, go from "parsing" → "parsed" → "ranked" in real time.
5. Once a batch settles (or on a timer), OpenAI drafts a digest and AgentMail sends it back to the user as a reply email.

## 2. Architecture

```
AgentMail inbox (inbound)
      ↓ webhook/poll → Convex action
   parse email → extract URLs (regex + OpenAI fallback for messy formats)
      ↓
   Firecrawl component: scrape(url) → markdown/structured JSON
      ↓ writes row per listing (status: pending→scraped)
   Convex table: listings { url, rawContent, status, extractedFields, score }
      ↓
   OpenAI action: extract structured fields (price, beds, location, etc.)
                  + score against user's stated preferences
      ↓ updates listing row (status: ranked)
   React/Vite frontend (Convex reactive queries) — live table, sorted by score
      ↓
   OpenAI action: compose digest summary
      ↓
   AgentMail component: send reply email with digest + links
```

## 3. Data model (Convex schema, rough)

- `users` — one row per person (or per inbox if auth is skipped: just keyed by inbox address)
- `preferences` — free-text or structured (price range, must-haves), tied to a user/thread
- `emails` — inbound message metadata (from, subject, receivedAt, threadId)
- `listings` — `{ emailId, url, status: "pending"|"scraping"|"scraped"|"ranked"|"failed", rawMarkdown, fields: {price, title, ...}, score }`
- `digests` — sent digest log (for the build log / demo, and to avoid re-sending)

## 4. Components/tools and exactly what each does

| Sponsor | Component | Job |
|---|---|---|
| Convex | core backend | schema, reactive queries/mutations, cron for polling, live UI sync |
| Convex | Firecrawl component (`@firecrawl/firecrawl-convex`) | `scrape()` each listing URL → clean markdown, written straight into `listings` table, no manual polling |
| Convex | AgentMail component | inbound inbox, thread/message sync into Convex tables reactively, outbound reply send |
| OpenAI | via Convex Agent component or plain `actions` calling OpenAI | (a) extract structured fields from scraped markdown, (b) score against preferences, (c) compose digest text |

No auth needed for MVP — one inbox = one demo user is fine for a hackathon; skip Convex Auth entirely unless there's time later.

## 5. Build order

1. **Environment setup** — Convex plugin, hackathon skill, hosting choice. ✅ Done (Convex plugin installed, hackathon skill installed, `convex.site` chosen as frontend host).
2. **Schema + basic Convex app** — empty tables, a placeholder page.
3. **AgentMail inbound wiring** — get a real inbox provisioned, confirm an inbound email lands as a row in Convex (highest-risk unknown, validate first).
4. **URL extraction** — pull listing links out of the email body (start with simple regex on `<a href>`/plain URLs; add OpenAI fallback only if needed).
5. **Firecrawl scrape pipeline** — action that takes a URL, calls `firecrawl.scrape()`, writes markdown + status into `listings`.
6. **OpenAI field extraction + scoring** — turn markdown into structured JSON (price, beds, location, etc.) and a 0–100 match score vs. the user's preference note.
7. **Live dashboard** — React frontend using `useQuery` on `listings`, sorted by score, showing status badges live as things move through the pipeline.
8. **Digest compose + send** — OpenAI writes a short digest, AgentMail sends it as a reply in the same thread.
9. **Polish for demo** — pick apartment-hunting as the concrete vertical for the video, seed with 2-3 real listing emails, make the live-update moment visually obvious (money shot for the 3-minute video).
10. **Deploy** — `convex.site` static hosting, confirm public URL works logged out.

## 6. Scope guardrails (to avoid ballooning)

- One vertical for the demo (apartments), even if the pipeline is generic.
- No payments, no multi-user auth, no mobile app.
- Digest = one email reply, not a notification system with preferences UI — preferences can just be a sentence in the first forwarded email.
- If Firecrawl scrape fails on a site (bot protection etc.), just mark `status: "failed"` and move on — don't build retry/proxy logic for a hackathon.
