import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { api } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";
import Docs from "./Docs";
import SignInForm from "./Auth";
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

// Marketing/tracking links carry huge query strings (trk/eid/otpToken/...)
// that are meaningless to a reader — show host + path only, full URL stays
// in the href and the title tooltip.
function displayUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 36 ? `${u.pathname.slice(0, 36)}…` : u.pathname;
    return `${u.hostname}${path}`;
  } catch {
    return url.length > 70 ? `${url.slice(0, 70)}…` : url;
  }
}

// Listing errors are ConvexErrors whose string form includes the full call
// stack — pull out just the human-readable message for display.
function shortErrorMessage(error: string): string {
  const messageMatch = error.match(/"message"\s*:\s*"([^"]+)"/);
  const text = messageMatch ? messageMatch[1] : error.split("\n")[0];
  return text.length > 180 ? `${text.slice(0, 180)}…` : text;
}

function ListingRow({ listing }: { listing: ListingDoc }) {
  const f = listing.fields;
  return (
    <li className="listing-row">
      <div className="listing-main">
        <a
          href={listing.url}
          target="_blank"
          rel="noreferrer"
          className="listing-title"
          title={listing.url}
        >
          {f?.title ?? displayUrl(listing.url)}
        </a>
        {listing.category && <CategoryTag category={listing.category} />}
        <div className="listing-meta">
          {[f?.price, f?.bedrooms, f?.location].filter(Boolean).join(" · ") ||
            (f?.title ? displayUrl(listing.url) : null)}
        </div>
        {f?.summary && <div className="listing-summary">{f.summary}</div>}
        {listing.status === "failed" && listing.error && (
          <div className="listing-error" title={listing.error}>
            {shortErrorMessage(listing.error)}
          </div>
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
            // Keying on status (not just _id) forces a remount whenever a
            // listing moves to a new stage, which replays the CSS flash
            // animation — the visible "something just happened live" cue.
            <ListingRow key={`${listing._id}-${listing.status}`} listing={listing} />
          ))}
        </ul>
      )}
    </section>
  );
}

const STATUS_ORDER: ListingDoc["status"][] = ["pending", "scraping", "scraped", "ranked", "failed"];

function BatchProgress({ listings }: { listings: ListingDoc[] }) {
  if (listings.length === 0) return null;

  const counts = listings.reduce(
    (acc, l) => {
      acc[l.status] = (acc[l.status] ?? 0) + 1;
      return acc;
    },
    {} as Partial<Record<ListingDoc["status"], number>>,
  );
  const total = listings.length;

  return (
    <div className="batch-progress">
      <div className="batch-progress-bar">
        {STATUS_ORDER.map((status) => {
          const count = counts[status];
          if (!count) return null;
          return (
            <div
              key={status}
              className={`batch-progress-segment batch-progress-${status}`}
              style={{ width: `${(count / total) * 100}%` }}
              title={`${count} ${STATUS_LABEL[status]}`}
            />
          );
        })}
      </div>
      <div className="batch-progress-legend">
        {STATUS_ORDER.map((status) => {
          const count = counts[status];
          if (!count) return null;
          return (
            <span key={status} className="batch-progress-count">
              <span className={`legend-dot legend-dot-${status}`} />
              {count} {STATUS_LABEL[status]}
            </span>
          );
        })}
      </div>
    </div>
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

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function SendNowButton({ disabled }: { disabled: boolean }) {
  const requestNow = useMutation(api.digest.requestNow);
  const [sending, setSending] = useState(false);
  return (
    <button
      className="send-now-button"
      disabled={disabled || sending}
      onClick={async () => {
        setSending(true);
        try {
          await requestNow();
        } finally {
          setSending(false);
        }
      }}
    >
      {sending ? "Sending…" : "Send digest now"}
    </button>
  );
}

function DigestBanner({ pendingCount }: { pendingCount: number }) {
  const schedule = useQuery(api.digest.getSchedule);
  const [, tick] = useState(0);

  useEffect(() => {
    // Ticks every second so the countdown visibly counts down live rather
    // than sitting on a stale "20 minutes" — the moment-to-moment motion is
    // the point of a live-updating dashboard.
    const id = setInterval(() => tick((n) => n + 1), 1_000);
    return () => clearInterval(id);
  }, []);

  if (!schedule) return null;

  if (schedule.scheduledFor !== undefined) {
    const remaining = schedule.scheduledFor - Date.now();
    return (
      <div className="digest-banner">
        <span>
          Digest with {pendingCount} listing{pendingCount === 1 ? "" : "s"} sends in{" "}
          <span className="digest-countdown">
            {remaining > 0 ? formatCountdown(remaining) : "0:00"}
          </span>
        </span>
        <SendNowButton disabled={pendingCount === 0} />
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

function StatsStrip({
  forwarded,
  ranked,
  digests,
}: {
  forwarded: number;
  ranked: number;
  digests: number;
}) {
  return (
    <div className="stats-strip">
      <div className="stat">
        <span className="stat-value">{forwarded}</span>
        <span className="stat-label">emails forwarded</span>
      </div>
      <div className="stat">
        <span className="stat-value">{ranked}</span>
        <span className="stat-label">listings ranked</span>
      </div>
      <div className="stat">
        <span className="stat-value">{digests}</span>
        <span className="stat-label">digests sent</span>
      </div>
    </div>
  );
}

function DigestHistory() {
  const digests = useQuery(api.dashboard.digestHistory);
  const [openId, setOpenId] = useState<string | null>(null);

  if (!digests || digests.length === 0) return null;

  return (
    <section className="digest-history">
      <h2>Digests sent</h2>
      <ul className="digest-list">
        {digests.map((d) => {
          const open = openId === d._id;
          return (
            <li key={d._id} className="digest-item">
              <button className="digest-item-header" onClick={() => setOpenId(open ? null : d._id)}>
                <span className="digest-item-title">
                  {d.listingCount} listing{d.listingCount === 1 ? "" : "s"}
                  {d.subject ? ` · re: ${d.subject}` : ""}
                </span>
                <span className="digest-item-time">
                  {new Date(d.sentAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                  <span className="digest-item-chevron">{open ? "▾" : "▸"}</span>
                </span>
              </button>
              {open && <pre className="digest-item-body">{d.body}</pre>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function AccountBar() {
  const me = useQuery(api.users.me);
  const { signOut } = useAuthActions();

  if (!me) return null;

  return (
    <div className="account-bar">
      <span>{me.email}</span>
      <button className="sign-out-button" onClick={() => void signOut()}>
        Sign out
      </button>
    </div>
  );
}

function Dashboard() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const overview = useQuery(api.dashboard.overview);
  const digestHistory = useQuery(api.dashboard.digestHistory);
  const allListings = overview?.flatMap(({ listings }) => listings) ?? [];
  const currentBatch = allListings.filter((l) => l.digestedAt === undefined);
  const pendingCount = currentBatch.filter((l) => l.status === "ranked" || l.status === "failed").length;
  const rankedCount = allListings.filter((l) => l.status === "ranked").length;

  if (isLoading) return null;
  if (!isAuthenticated) return <SignInForm />;

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-top">
          <div className="brand">
            <img src="/logo.svg" alt="" className="brand-logo" width="36" height="36" />
            <h1>Listing Digest</h1>
          </div>
          <div className="app-header-actions">
            <a href="/docs" className="docs-link">
              How to use
            </a>
            <AccountBar />
          </div>
        </div>
        <p className="app-tagline">
          Forward listings, watch them get scraped and ranked live, get a digest back by email.
        </p>
      </header>

      <InboxSetup />
      <StatsStrip
        forwarded={overview?.length ?? 0}
        ranked={rankedCount}
        digests={digestHistory?.length ?? 0}
      />
      <DigestBanner pendingCount={pendingCount} />
      <BatchProgress listings={currentBatch} />

      <main className="app-main">
        {overview === undefined || overview === null ? (
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

      <DigestHistory />
    </div>
  );
}

function App() {
  return window.location.pathname === "/docs" ? <Docs /> : <Dashboard />;
}

export default App;
