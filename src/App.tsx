import { useAction, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";
import "./App.css";

type ListingDoc = Doc<"listings">;
type EmailDoc = Doc<"emails">;

const STATUS_LABEL: Record<ListingDoc["status"], string> = {
  pending: "Pending",
  scraping: "Scraping",
  scraped: "Parsed",
  ranked: "Ranked",
  failed: "Failed",
};

function StatusBadge({ status }: { status: ListingDoc["status"] }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>;
}

const CATEGORY_LABEL: Record<string, string> = {
  jobs: "Jobs",
  flats: "Flats",
  newsletter: "Newsletter",
  other: "Other",
};

function CategoryTag({ category }: { category: string }) {
  return <span className={`category-tag category-${category}`}>{CATEGORY_LABEL[category] ?? category}</span>;
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="score-bar" title={`${score}/100`}>
      <div className="score-bar-fill" style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
      <span className="score-bar-label">{score}</span>
    </div>
  );
}

function ListingRow({ listing }: { listing: ListingDoc }) {
  const f = listing.fields;
  return (
    <li className="listing-row">
      <div className="listing-main">
        <a href={listing.url} target="_blank" rel="noreferrer" className="listing-title">
          {f?.title ?? listing.url}
        </a>
        {listing.category && <CategoryTag category={listing.category} />}
        <div className="listing-meta">
          {[f?.price, f?.bedrooms, f?.location].filter(Boolean).join(" · ") || listing.url}
        </div>
        {f?.summary && <div className="listing-summary">{f.summary}</div>}
        {listing.status === "failed" && listing.error && (
          <div className="listing-error">{listing.error}</div>
        )}
      </div>
      <div className="listing-side">
        <StatusBadge status={listing.status} />
        {listing.status === "ranked" && listing.score !== undefined && (
          <ScoreBar score={listing.score} />
        )}
        {listing.digestedAt !== undefined && <span className="digested-tag">in digest ✓</span>}
      </div>
    </li>
  );
}

function EmailCard({ email, listings }: { email: EmailDoc; listings: ListingDoc[] }) {
  return (
    <section className="email-card">
      <header className="email-card-header">
        <div>
          <div className="email-from">{email.from}</div>
          {email.preferenceNote && <div className="email-pref">"{email.preferenceNote}"</div>}
        </div>
      </header>
      {listings.length === 0 ? (
        <p className="empty-note">No listing links found in this email.</p>
      ) : (
        <ul className="listing-list">
          {listings.map((listing) => (
            <ListingRow key={listing._id} listing={listing} />
          ))}
        </ul>
      )}
    </section>
  );
}

function InboxSetup() {
  const inbox = useQuery(api.inbox.get);
  const provision = useAction(api.inbox.provision);
  const [provisioning, setProvisioning] = useState(false);
  const [copied, setCopied] = useState(false);

  if (inbox === undefined) return null;

  if (inbox !== null) {
    const address = inbox.email;
    return (
      <div className="inbox-banner">
        Forward listing emails to{" "}
        <button
          className="inbox-address"
          onClick={() => {
            navigator.clipboard?.writeText(address).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {address}
        </button>
        {copied && <span className="copied-note">copied</span>} — put your preferences
        (budget, must-haves) as the first line of your note.
      </div>
    );
  }

  return (
    <div className="inbox-banner">
      <button
        className="provision-button"
        disabled={provisioning}
        onClick={async () => {
          setProvisioning(true);
          try {
            await provision({});
          } finally {
            setProvisioning(false);
          }
        }}
      >
        {provisioning ? "Creating inbox…" : "Create your inbox"}
      </button>
    </div>
  );
}

function formatRelative(ms: number): string {
  const minutes = Math.round(Math.abs(ms) / 60_000);
  if (minutes < 1) return "less than a minute";
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function DigestBanner({ pendingCount }: { pendingCount: number }) {
  const schedule = useQuery(api.digest.getSchedule);
  const [, tick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!schedule) return null;

  if (schedule.scheduledFor !== undefined) {
    const remaining = schedule.scheduledFor - Date.now();
    return (
      <div className="digest-banner">
        Digest with {pendingCount} listing{pendingCount === 1 ? "" : "s"} sends in{" "}
        {remaining > 0 ? formatRelative(remaining) : "a moment"} — reply with "now" to send it
        right away.
      </div>
    );
  }

  if (schedule.lastDigestAt !== undefined) {
    return (
      <div className="digest-banner digest-banner-idle">
        Last digest sent {formatRelative(Date.now() - schedule.lastDigestAt)} ago. Forward a new
        listing to start the next batch.
      </div>
    );
  }

  return null;
}

function App() {
  const overview = useQuery(api.dashboard.overview);
  const pendingCount =
    overview?.reduce(
      (count, { listings }) =>
        count +
        listings.filter(
          (l) => l.digestedAt === undefined && (l.status === "ranked" || l.status === "failed"),
        ).length,
      0,
    ) ?? 0;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Listing Digest</h1>
        <p className="app-tagline">
          Forward listings, watch them get scraped and ranked live, get a digest back by email.
        </p>
      </header>

      <InboxSetup />
      <DigestBanner pendingCount={pendingCount} />

      <main className="app-main">
        {overview === undefined ? (
          <p className="empty-note">Loading…</p>
        ) : overview.length === 0 ? (
          <p className="empty-note">
            No forwarded emails yet. Forward a listing link to your inbox address above to see it
            appear here in real time.
          </p>
        ) : (
          overview.map(({ email, listings }) => (
            <EmailCard key={email._id} email={email} listings={listings} />
          ))
        )}
      </main>
    </div>
  );
}

export default App;
