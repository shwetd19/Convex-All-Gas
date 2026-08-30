import type { ReactNode } from "react";
import "./Docs.css";

function Command({ example, children }: { example: string; children: ReactNode }) {
  return (
    <div className="cmd">
      <code className="cmd-example">{example}</code>
      <p className="cmd-desc">{children}</p>
    </div>
  );
}

function Docs() {
  return (
    <div className="docs">
      <a href="/" className="docs-back">
        ← Back to dashboard
      </a>

      <h1>How to use Listing Digest</h1>
      <p className="docs-intro">
        Forward emails with listing links to your inbox address. Everything you send gets
        scraped, scored against your stated preferences, and batched into a digest reply — no
        commands required for the basic flow. The commands below give you control over{" "}
        <em>when</em> and <em>what</em> gets sent.
      </p>

      <h2>The basics</h2>
      <ol className="docs-steps">
        <li>
          Forward a listing email (or paste a link into a new email) to your inbox address, shown
          at the top of the dashboard.
        </li>
        <li>
          Put your preferences as the <strong>first line</strong> of the email — budget,
          must-haves, whatever matters. Example: <code>under $2500, 2BR, near downtown</code>.
        </li>
        <li>
          Watch the dashboard update live as each link gets scraped, scored, and tagged with a
          category (Jobs / Flats / Newsletter / Other).
        </li>
        <li>
          By default, everything you send gets batched into <strong>one</strong> digest reply
          after a 20-minute quiet period — so forwarding five emails in a row still gets you one
          email back, not five.
        </li>
      </ol>

      <h2>Commands</h2>
      <p className="docs-intro">
        Trigger these by putting the word in the <strong>subject line</strong> or the{" "}
        <strong>first line</strong> of the email body (your preference note).
      </p>

      <Command example='Subject: "digest" or "now"'>
        Skip the 20-minute wait and send the digest immediately, covering everything currently
        pending. Works even with nothing pending — you'll get a reply either way, not silence.
      </Command>

      <Command example='Subject: "jobs now"'>
        Send an immediate digest scoped to just the <strong>Jobs</strong> category, leaving
        Flats/Newsletter/Other listings still pending for their own batch.
      </Command>

      <Command example='Subject: "flats now"'>
        Same idea, scoped to <strong>Flats</strong> (matches "flat" or "apartment" too).
      </Command>

      <Command example='Subject: "newsletter digest"'>
        Same idea, scoped to <strong>Newsletter</strong>-classified content.
      </Command>

      <h2>Reading the dashboard</h2>
      <ul className="docs-list">
        <li>
          <strong>Status badges</strong> — Pending → Scraping → Parsed → Ranked (or Failed) is
          each listing's live progress through the pipeline.
        </li>
        <li>
          <strong>Score</strong> — 0–100, how well a ranked listing matches your stated
          preferences, with a one-line reason from the model.
        </li>
        <li>
          <strong>Category tag</strong> — Jobs / Flats / Newsletter / Other, classified
          automatically during scoring.
        </li>
        <li>
          <strong>"in digest ✓"</strong> — this listing has already been included in a sent
          digest and won't be sent again.
        </li>
        <li>
          <strong>Top banner</strong> — shows either a countdown to the next scheduled digest, or
          how long ago the last one went out.
        </li>
      </ul>

      <h2>Notes</h2>
      <ul className="docs-list">
        <li>
          A "failed" listing usually means the page couldn't be scraped (blocked, rate-limited, or
          not publicly accessible) — forwarding it again may work once the underlying issue
          clears.
        </li>
        <li>
          Categorization is an LLM best-guess, not a strict rule — an ambiguous page may land in
          "Other".
        </li>
      </ul>
    </div>
  );
}

export default Docs;
