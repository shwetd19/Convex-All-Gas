import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { api } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";
import SignInForm from "./Auth";
import "./App.css";

type BusinessDoc = Doc<"businesses">;
type LeadDoc = Doc<"leads">;
type OutreachDoc = Doc<"outreach">;
type MessageDoc = Doc<"messages">;
type LeadRow = { lead: LeadDoc; outreach: OutreachDoc | null };

const TYPE_LABEL: Record<LeadDoc["type"], string> = {
  competitor: "Competitor",
  complement: "Complement",
  office: "Office",
  event: "Event",
};

const STATUS_LABEL: Record<LeadDoc["status"], string> = {
  sourced: "Sourced",
  approved: "Sending…",
  outreach_sent: "Sent",
  replied: "Replied",
  followed_up: "Followed up",
  cold: "Cold",
  won: "Won",
  skipped: "Skipped",
};

const CLASSIFICATION_LABEL: Record<string, string> = {
  interested: "Interested",
  not_interested: "Not interested",
  needs_info: "Needs info",
};

function formatWhen(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "any minute";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function useNowTick(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
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

function Header({ business, children }: { business?: BusinessDoc | null; children?: React.ReactNode }) {
  return (
    <header className="app-header">
      <div className="app-header-top">
        <div className="brand">
          <img src="/logo.svg" alt="" className="brand-logo" width="36" height="36" />
          <h1>Block</h1>
        </div>
        <div className="app-header-actions">
          {children}
          <AccountBar />
        </div>
      </div>
      {business?.name ? (
        <p className="app-tagline">
          Working the block for <strong>{business.name}</strong>
          {business.address ? ` — ${business.address}` : ""}
        </p>
      ) : (
        <p className="app-tagline">
          Drop your business link. The agent maps competitors, finds who's worth pitching
          nearby, reaches out for you, and keeps working the leads.
        </p>
      )}
    </header>
  );
}

// Onboarding step 1 — also the retry screen after a failed intake.
function Onboarding({ business }: { business: BusinessDoc | null }) {
  const create = useMutation(api.businesses.create);
  const [url, setUrl] = useState(business?.url ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await create({ url });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="onboarding-card">
      <h2>Paste your business URL</h2>
      <p className="onboarding-hint">
        The agent reads your site, finds your spot on the map, then scans your block for
        competitors, complements, offices, and events worth pitching.
      </p>
      {business?.status === "failed" && business.error && (
        <div className="error-banner">Setup failed: {business.error}</div>
      )}
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit} className="onboarding-form">
        <input
          className="auth-input onboarding-input"
          type="text"
          placeholder="yourshop.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
        <button className="provision-button" type="submit" disabled={submitting}>
          {submitting ? "Starting…" : business?.status === "failed" ? "Try again" : "Map my block"}
        </button>
      </form>
    </div>
  );
}

// Live progress while Firecrawl + Places + OpenAI work — reads the same
// activity feed the rest of the app uses, so the text is real, not staged.
function ProgressPanel({ title }: { title: string }) {
  const activity = useQuery(api.activity.listMine);
  const lines = (activity ?? []).slice(0, 6);
  return (
    <div className="onboarding-card">
      <h2>
        <span className="spinner" /> {title}
      </h2>
      <ul className="progress-lines">
        {lines.length === 0 ? (
          <li>Starting up…</li>
        ) : (
          lines.map((a) => <li key={a._id}>{a.message}</li>)
        )}
      </ul>
    </div>
  );
}

// Onboarding step 3: "Is this you?" — catches wrong matches before wasting
// a sourcing run.
function ConfirmCard({ business }: { business: BusinessDoc }) {
  const confirm = useMutation(api.businesses.confirm);
  const reset = useMutation(api.businesses.reset);
  const [busy, setBusy] = useState(false);
  return (
    <div className="onboarding-card">
      <h2>Is this you?</h2>
      <div className="confirm-business">
        <div className="confirm-name">{business.name ?? business.url}</div>
        {business.category && <div className="confirm-category">{business.category}</div>}
        {business.address && <div className="confirm-address">{business.address}</div>}
        {business.description && <p className="confirm-description">{business.description}</p>}
        {business.offerings && business.offerings.length > 0 && (
          <div className="confirm-offerings">
            {business.offerings.map((o) => (
              <span key={o} className="offering-chip">
                {o}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="confirm-actions">
        <button
          className="provision-button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await confirm();
            } finally {
              setBusy(false);
            }
          }}
        >
          Yes — scan my block
        </button>
        <button
          className="ghost-button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await reset();
            } finally {
              setBusy(false);
            }
          }}
        >
          Not me — start over
        </button>
      </div>
    </div>
  );
}

function InboxBanner() {
  const inbox = useQuery(api.inbox.get);
  const provision = useAction(api.inbox.provision);
  const [provisioning, setProvisioning] = useState(false);
  const [copied, setCopied] = useState(false);

  if (inbox === undefined) return null;
  if (inbox !== null) {
    return (
      <div className="inbox-banner">
        Outreach sends from the agent's own inbox{" "}
        <button
          className="inbox-address"
          onClick={() => {
            navigator.clipboard?.writeText(inbox.email).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {inbox.email}
        </button>
        {copied && <span className="copied-note">copied</span>} — replies land here and show up
        below, never in your personal inbox.
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
        {provisioning ? "Creating outreach inbox…" : "Create the outreach inbox"}
      </button>
      <span>One dedicated AgentMail inbox sends all outreach — set it up once.</span>
    </div>
  );
}

function StatsStrip({ rows }: { rows: LeadRow[] }) {
  const sourced = rows.filter((r) => r.lead.status !== "skipped").length;
  const sent = rows.filter((r) => r.outreach?.sentAt !== undefined).length;
  const replies = rows.filter((r) => r.outreach?.lastReplyAt !== undefined).length;
  const followUpsPending = rows.filter(
    (r) =>
      r.outreach?.sentAt !== undefined &&
      r.outreach.followUpSentAt === undefined &&
      r.outreach.lastReplyAt === undefined &&
      r.outreach.nextActionAt !== undefined,
  ).length;
  const stats = [
    { value: sourced, label: "leads sourced" },
    { value: sent, label: "outreach sent" },
    { value: replies, label: "replies received" },
    { value: followUpsPending, label: "follow-ups pending" },
  ];
  return (
    <div className="stats-strip stats-strip-4">
      {stats.map((s) => (
        <div key={s.label} className="stat">
          <span className="stat-value">{s.value}</span>
          <span className="stat-label">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

function DraftEditor({ lead, outreach }: { lead: LeadDoc; outreach: OutreachDoc }) {
  const updateDraft = useMutation(api.outreach.updateDraft);
  const approve = useMutation(api.leads.approve);
  const [subject, setSubject] = useState(outreach.subject ?? "");
  const [body, setBody] = useState(outreach.draftText ?? "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const dirty = subject !== (outreach.subject ?? "") || body !== (outreach.draftText ?? "");

  return (
    <div className="draft-editor">
      <div className="draft-editor-label">Drafted outreach — edit before it sends</div>
      <input
        className="auth-input"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Subject"
      />
      <textarea
        className="auth-input draft-textarea"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={8}
      />
      {note && <div className="error-banner">{note}</div>}
      <div className="confirm-actions">
        <button
          className="provision-button"
          disabled={busy || !lead.contactEmail}
          onClick={async () => {
            setBusy(true);
            setNote(null);
            try {
              if (dirty) await updateDraft({ leadId: lead._id, subject, draftText: body });
              await approve({ leadId: lead._id });
            } catch (err) {
              setNote(err instanceof Error ? err.message : String(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Working…" : `Approve & send to ${lead.contactEmail ?? "?"}`}
        </button>
        {dirty && (
          <button
            className="ghost-button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setNote(null);
              try {
                await updateDraft({ leadId: lead._id, subject, draftText: body });
              } catch (err) {
                setNote(err instanceof Error ? err.message : String(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            Save draft
          </button>
        )}
      </div>
    </div>
  );
}

function ThreadView({ messages }: { messages: MessageDoc[] }) {
  return (
    <div className="thread">
      {messages.map((m) => (
        <div key={m._id} className={`thread-message thread-${m.direction}`}>
          <div className="thread-meta">
            {m.direction === "outbound"
              ? m.kind === "follow_up"
                ? "Follow-up sent"
                : "Outreach sent"
              : `Reply${m.from ? ` from ${m.from}` : ""}`}
            {" · "}
            {formatWhen(m.sentAt)}
            {m.classification && (
              <span className={`class-tag class-${m.classification}`}>
                {CLASSIFICATION_LABEL[m.classification]}
              </span>
            )}
          </div>
          {m.subject && <div className="thread-subject">{m.subject}</div>}
          <pre className="thread-body">{m.text}</pre>
        </div>
      ))}
    </div>
  );
}

function LeadDetail({ lead, now }: { lead: LeadDoc; now: number }) {
  const data = useQuery(api.outreach.getForLead, { leadId: lead._id });
  const followUpNow = useMutation(api.outreach.followUpNow);
  const markWon = useMutation(api.leads.markWon);
  const skip = useMutation(api.leads.skip);
  const [busy, setBusy] = useState(false);

  if (data === undefined) return <div className="lead-detail">Loading…</div>;
  const outreach = data?.outreach ?? null;
  const messages = data?.messages ?? [];

  const canFollowUp =
    outreach?.sentAt !== undefined &&
    outreach?.followUpSentAt === undefined &&
    outreach?.lastReplyAt === undefined;

  return (
    <div className="lead-detail">
      {lead.evidence && (
        <div className="evidence">
          <div className="evidence-label">Sourcing evidence</div>
          <blockquote>{lead.evidence}</blockquote>
          {lead.sourceUrl && (
            <a href={lead.sourceUrl} target="_blank" rel="noreferrer" className="evidence-link">
              {lead.sourceUrl}
            </a>
          )}
        </div>
      )}

      {outreach && outreach.sentAt === undefined && outreach.draftStatus === "ready" && (
        <DraftEditor lead={lead} outreach={outreach} />
      )}
      {outreach && outreach.sentAt === undefined && outreach.draftStatus === "generating" && (
        <div className="muted-note">
          <span className="spinner" /> Drafting personalized outreach…
        </div>
      )}
      {outreach && outreach.draftStatus === "failed" && outreach.sentAt === undefined && (
        <div className="error-banner">Draft generation failed — check the activity feed.</div>
      )}
      {!outreach && !lead.contactEmail && (
        <div className="muted-note">
          No contact email found on their site, so the agent can't pitch them automatically.
        </div>
      )}

      {messages.length > 0 && <ThreadView messages={messages} />}

      {canFollowUp && outreach?.nextActionAt !== undefined && (
        <div className="followup-line">
          Follow-up scheduled {formatWhen(outreach.nextActionAt)} (in{" "}
          {formatCountdown(outreach.nextActionAt - now)})
          <button
            className="ghost-button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await followUpNow({ leadId: lead._id });
              } finally {
                setBusy(false);
              }
            }}
          >
            Send follow-up now
          </button>
        </div>
      )}

      <div className="lead-detail-actions">
        {lead.status !== "won" && lead.status !== "skipped" && (
          <button className="ghost-button ghost-win" onClick={() => void markWon({ leadId: lead._id })}>
            Mark won
          </button>
        )}
        {(lead.status === "sourced" || lead.status === "approved") && (
          <button className="ghost-button" onClick={() => void skip({ leadId: lead._id })}>
            Skip this lead
          </button>
        )}
      </div>
    </div>
  );
}

function LeadCard({ row, now }: { row: LeadRow; now: number }) {
  const { lead, outreach } = row;
  const approve = useMutation(api.leads.approve);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const actionable =
    lead.status === "sourced" &&
    lead.contactEmail &&
    outreach?.draftStatus === "ready" &&
    outreach.sentAt === undefined;

  return (
    <li
      key={`${lead._id}-${lead.status}-${outreach?.draftStatus ?? ""}`}
      className={`lead-card ${lead.status === "skipped" || lead.status === "cold" ? "lead-card-dim" : ""}`}
    >
      <button className="lead-card-main" onClick={() => setOpen((o) => !o)}>
        <div className="lead-card-top">
          <span className="lead-name">{lead.name}</span>
          <span className={`type-tag type-${lead.type}`}>{TYPE_LABEL[lead.type]}</span>
          <span className={`badge badge-${lead.status}`}>{STATUS_LABEL[lead.status]}</span>
          {outreach?.replyClassification && (
            <span className={`class-tag class-${outreach.replyClassification}`}>
              {CLASSIFICATION_LABEL[outreach.replyClassification]}
            </span>
          )}
        </div>
        {lead.relevanceNote && <div className="lead-note">{lead.relevanceNote}</div>}
        <div className="lead-contact">
          {lead.contactEmail ??
            (outreach?.draftStatus === "generating" ? "finding contact…" : "no contact email found")}
          {lead.address ? ` · ${lead.address}` : ""}
        </div>
      </button>
      <div className="lead-card-side">
        {actionable ? (
          <button
            className="send-now-button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await approve({ leadId: lead._id });
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Sending…" : "Approve outreach"}
          </button>
        ) : lead.status === "sourced" && outreach?.draftStatus === "generating" ? (
          <span className="muted-note">
            <span className="spinner" /> drafting…
          </span>
        ) : (
          <button className="ghost-button" onClick={() => setOpen((o) => !o)}>
            {open ? "Close" : outreach?.sentAt !== undefined ? "View thread" : "Details"}
          </button>
        )}
      </div>
      {open && (
        <div className="lead-card-detail">
          <LeadDetail lead={lead} now={now} />
        </div>
      )}
    </li>
  );
}

function ActivityFeed() {
  const activity = useQuery(api.activity.listMine);
  if (!activity || activity.length === 0) {
    return <p className="empty-note">Nothing yet — activity shows up here as the agent works.</p>;
  }
  return (
    <ul className="activity-feed">
      {activity.map((a) => (
        <li key={a._id} className={`activity-line activity-${a.kind}`}>
          <span className="activity-time">{formatWhen(a._creationTime)}</span>
          <span>{a.message}</span>
        </li>
      ))}
    </ul>
  );
}

function SettingsPanel({ business }: { business: BusinessDoc }) {
  const updateSettings = useMutation(api.businesses.updateSettings);
  const rescanNow = useMutation(api.businesses.rescanNow);
  const inbox = useQuery(api.inbox.get);
  const [rescanBusy, setRescanBusy] = useState(false);

  return (
    <div className="settings-panel">
      <div className="settings-row">
        <label>
          Approval mode
          <select
            className="auth-input"
            value={business.approvalMode}
            onChange={(e) =>
              void updateSettings({
                approvalMode: e.target.value as "approve_each" | "auto_send",
              })
            }
          >
            <option value="approve_each">Approve each email</option>
            <option value="auto_send">Auto-send drafts</option>
          </select>
        </label>
        <label>
          Follow-up delay (days)
          <input
            className="auth-input"
            type="number"
            min={1}
            max={30}
            value={business.followUpDelayDays}
            onChange={(e) => void updateSettings({ followUpDelayDays: Number(e.target.value) })}
          />
        </label>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={business.weeklyRescan}
            onChange={(e) => void updateSettings({ weeklyRescan: e.target.checked })}
          />
          Weekly automatic rescan
        </label>
      </div>
      <div className="settings-row settings-row-footer">
        <span className="muted-note">
          Outreach inbox: {inbox ? `${inbox.email} ✓` : "not set up yet"}
          {business.lastScanAt ? ` · last scan ${formatWhen(business.lastScanAt)}` : ""}
        </span>
        <button
          className="ghost-button"
          disabled={rescanBusy || business.status !== "ready"}
          onClick={async () => {
            setRescanBusy(true);
            try {
              await rescanNow();
            } finally {
              setRescanBusy(false);
            }
          }}
        >
          Rescan the block now
        </button>
      </div>
    </div>
  );
}

const TABS: { key: LeadDoc["type"] | "activity"; label: string }[] = [
  { key: "competitor", label: "Competitors" },
  { key: "complement", label: "Complements" },
  { key: "office", label: "Offices" },
  { key: "event", label: "Events" },
  { key: "activity", label: "Activity" },
];

function MainDashboard({ business }: { business: BusinessDoc }) {
  const rows = useQuery(api.leads.listMine) ?? [];
  const approveAll = useMutation(api.leads.approveAll);
  const [tab, setTab] = useState<LeadDoc["type"] | "activity">("competitor");
  const [showSettings, setShowSettings] = useState(false);
  const [approvingAll, setApprovingAll] = useState(false);
  const now = useNowTick();

  const readyDrafts = rows.filter(
    (r) =>
      r.lead.status === "sourced" &&
      r.lead.contactEmail &&
      r.outreach?.draftStatus === "ready" &&
      r.outreach.sentAt === undefined,
  ).length;

  const tabRows = (type: LeadDoc["type"]) =>
    rows
      .filter((r) => r.lead.type === type)
      .sort((a, b) => (b.lead.score ?? 0) - (a.lead.score ?? 0));

  const countFor = (key: LeadDoc["type"] | "activity") =>
    key === "activity" ? null : rows.filter((r) => r.lead.type === key).length;

  return (
    <div className="app">
      <Header business={business}>
        <button className="docs-link" onClick={() => setShowSettings((s) => !s)}>
          {showSettings ? "Close settings" : "Settings"}
        </button>
      </Header>

      <InboxBanner />
      {showSettings && <SettingsPanel business={business} />}

      {business.status === "sourcing" && (
        <div className="digest-banner">
          <span>
            <span className="spinner" /> Scanning your block — leads appear below as each place
            is judged…
          </span>
        </div>
      )}

      <StatsStrip rows={rows} />

      {readyDrafts > 0 && business.approvalMode === "approve_each" && (
        <div className="digest-banner">
          <span>
            {readyDrafts} outreach draft{readyDrafts === 1 ? "" : "s"} ready for review
          </span>
          <button
            className="send-now-button"
            disabled={approvingAll}
            onClick={async () => {
              setApprovingAll(true);
              try {
                await approveAll();
              } finally {
                setApprovingAll(false);
              }
            }}
          >
            {approvingAll ? "Sending…" : "Approve & send all"}
          </button>
        </div>
      )}

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab ${tab === t.key ? "tab-active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {countFor(t.key) !== null && <span className="tab-count">{countFor(t.key)}</span>}
          </button>
        ))}
      </nav>

      <main className="app-main">
        {tab === "activity" ? (
          <ActivityFeed />
        ) : tabRows(tab).length === 0 ? (
          <p className="empty-note">
            {business.status === "sourcing"
              ? "Nothing judged in this category yet — watch the Activity tab."
              : "No leads in this category yet. Try a rescan from Settings."}
          </p>
        ) : (
          <ul className="lead-list">
            {tabRows(tab).map((row) => (
              <LeadCard key={row.lead._id} row={row} now={now} />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function Root() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const business = useQuery(api.businesses.get);

  if (isLoading) return null;
  if (!isAuthenticated) return <SignInForm />;
  if (business === undefined) return null;

  if (business === null || business.status === "failed") {
    return (
      <div className="app">
        <Header business={null} />
        <Onboarding business={business} />
      </div>
    );
  }
  if (business.status === "scraping") {
    return (
      <div className="app">
        <Header business={null} />
        <ProgressPanel title="Reading your site…" />
      </div>
    );
  }
  if (business.status === "confirm") {
    return (
      <div className="app">
        <Header business={null} />
        <ConfirmCard business={business} />
      </div>
    );
  }
  return <MainDashboard business={business} />;
}

export default function App() {
  return <Root />;
}
