import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
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
  sourced: "New lead",
  approved: "Sending…",
  outreach_sent: "Outreach sent",
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

const KIND_LABEL: Record<MessageDoc["kind"], string> = {
  initial: "Outreach",
  follow_up: "Follow-up",
  reply: "Reply",
  auto_reply: "Auto-reply",
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

// ---------------------------------------------------------------- shell

function TopBar({
  businesses,
  selectedId,
  onSelect,
  onAdd,
}: {
  businesses: BusinessDoc[];
  selectedId: Id<"businesses"> | null;
  onSelect: (id: Id<"businesses">) => void;
  onAdd: () => void;
}) {
  const me = useQuery(api.users.me);
  const { signOut } = useAuthActions();
  return (
    <div className="topbar">
      <div className="topbar-inner">
        <div className="brand">
          <img src="/logo.svg" alt="" className="brand-logo" width="32" height="32" />
          <span className="brand-name">Block</span>
        </div>
        <div className="topbar-actions">
          {businesses.length > 0 && (
            <>
              <select
                className="biz-switcher"
                value={selectedId ?? businesses[0]._id}
                onChange={(e) => onSelect(e.target.value as Id<"businesses">)}
              >
                {businesses.map((b) => (
                  <option key={b._id} value={b._id}>
                    {b.name ?? b.url}
                  </option>
                ))}
              </select>
              <button className="btn btn-secondary btn-sm" onClick={onAdd}>
                + Add business
              </button>
            </>
          )}
          {me && (
            <div className="account-bar">
              <span className="account-email">{me.email}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => void signOut()}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ onboarding

function Onboarding({ onCreated, onCancel }: { onCreated: (id: Id<"businesses">) => void; onCancel?: () => void }) {
  const create = useMutation(api.businesses.create);
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const id = await create({ url });
      onCreated(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="panel-card onboarding-card">
      <h2>Add a business</h2>
      <p className="panel-hint">
        Paste the business website. The agent reads the site, finds it on the map, then scans
        the surrounding block for competitors, complements, offices, and events worth pitching
        — and drafts the outreach for you.
      </p>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit} className="onboarding-form">
        <input
          className="text-input onboarding-input"
          type="text"
          placeholder="yourshop.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting ? "Starting…" : "Map my block"}
        </button>
        {onCancel && (
          <button className="btn btn-ghost" type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </form>
    </div>
  );
}

function ProgressPanel({ business, title }: { business: BusinessDoc; title: string }) {
  const activity = useQuery(api.activity.list, { businessId: business._id });
  const lines = (activity ?? []).slice(0, 6);
  return (
    <div className="panel-card">
      <h2>
        <span className="spinner" /> {title}
      </h2>
      <ul className="progress-lines">
        {lines.length === 0 ? <li>Starting up…</li> : lines.map((a) => <li key={a._id}>{a.message}</li>)}
      </ul>
    </div>
  );
}

function ConfirmCard({ business }: { business: BusinessDoc }) {
  const confirm = useMutation(api.businesses.confirm);
  const remove = useMutation(api.businesses.remove);
  const [busy, setBusy] = useState(false);
  return (
    <div className="panel-card">
      <h2>Is this you?</h2>
      <p className="panel-hint">Confirming avoids scanning the wrong neighborhood.</p>
      <div className="confirm-business">
        <div className="confirm-name">{business.name ?? business.url}</div>
        {business.category && <div className="confirm-category">{business.category}</div>}
        {business.address && <div className="confirm-address">{business.address}</div>}
        {business.description && <p className="confirm-description">{business.description}</p>}
        {business.offerings && business.offerings.length > 0 && (
          <div className="chip-row">
            {business.offerings.map((o) => (
              <span key={o} className="offering-chip">
                {o}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="button-row">
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await confirm({ businessId: business._id });
            } finally {
              setBusy(false);
            }
          }}
        >
          Yes — scan my block
        </button>
        <button
          className="btn btn-ghost"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await remove({ businessId: business._id });
            } finally {
              setBusy(false);
            }
          }}
        >
          Not me — remove
        </button>
      </div>
    </div>
  );
}

function FailedCard({ business }: { business: BusinessDoc }) {
  const retry = useMutation(api.businesses.retryIntake);
  const remove = useMutation(api.businesses.remove);
  const [busy, setBusy] = useState(false);
  return (
    <div className="panel-card">
      <h2>Setup failed</h2>
      <div className="error-banner">{business.error ?? "Something went wrong."}</div>
      <div className="button-row">
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await retry({ businessId: business._id });
            } finally {
              setBusy(false);
            }
          }}
        >
          Try again
        </button>
        <button
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => void remove({ businessId: business._id })}
        >
          Remove this business
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------- dashboard

function InboxBanner() {
  const inbox = useQuery(api.inbox.get);
  const provision = useAction(api.inbox.provision);
  const [provisioning, setProvisioning] = useState(false);
  const [copied, setCopied] = useState(false);

  if (inbox === undefined) return null;
  if (inbox !== null) {
    return (
      <div className="inbox-banner">
        <span className="inbox-dot" /> Agent inbox{" "}
        <button
          className="inbox-address"
          title="Copy address"
          onClick={() => {
            navigator.clipboard?.writeText(inbox.email).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {inbox.email}
        </button>
        {copied && <span className="copied-note">copied</span>}
        <span className="inbox-hint">
          — all outreach and replies flow through it, never your personal inbox.
        </span>
      </div>
    );
  }
  return (
    <div className="inbox-banner">
      <button
        className="btn btn-primary btn-sm"
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
        {provisioning ? "Creating agent inbox…" : "Create the agent inbox"}
      </button>
      <span className="inbox-hint">One dedicated inbox sends all outreach — set it up once.</span>
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
    { value: sourced, label: "Leads sourced" },
    { value: sent, label: "Outreach sent" },
    { value: replies, label: "Replies received" },
    { value: followUpsPending, label: "Follow-ups pending" },
  ];
  return (
    <div className="stats-strip">
      {stats.map((s) => (
        <div key={s.label} className="stat">
          <span className="stat-value">{s.value}</span>
          <span className="stat-label">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

function ThreadView({
  messages,
  businessName,
  leadName,
}: {
  messages: MessageDoc[];
  businessName: string;
  leadName: string;
}) {
  return (
    <div className="thread">
      <div className="section-label">Conversation</div>
      {messages.map((m) => (
        <div key={m._id} className={`thread-message thread-${m.direction}`}>
          <div className="thread-meta">
            <span className="thread-sender">
              {m.direction === "outbound" ? `${businessName} · agent` : leadName}
            </span>
            <span className={`kind-chip kind-${m.kind}`}>{KIND_LABEL[m.kind]}</span>
            {m.classification && (
              <span className={`class-tag class-${m.classification}`}>
                {CLASSIFICATION_LABEL[m.classification]}
              </span>
            )}
            <span className="thread-time">{formatWhen(m.sentAt)}</span>
          </div>
          {m.subject && <div className="thread-subject">{m.subject}</div>}
          <pre className="thread-body">{m.text}</pre>
        </div>
      ))}
    </div>
  );
}

function DraftEditor({ lead, outreach, onSent }: { lead: LeadDoc; outreach: OutreachDoc; onSent?: () => void }) {
  const updateDraft = useMutation(api.outreach.updateDraft);
  const approve = useMutation(api.leads.approve);
  const [subject, setSubject] = useState(outreach.subject ?? "");
  const [body, setBody] = useState(outreach.draftText ?? "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const dirty = subject !== (outreach.subject ?? "") || body !== (outreach.draftText ?? "");

  return (
    <div className="draft-editor">
      <div className="section-label">Drafted outreach — review before it sends</div>
      <label className="field-label">
        Subject
        <input className="text-input" value={subject} onChange={(e) => setSubject(e.target.value)} />
      </label>
      <label className="field-label">
        Email body
        <textarea
          className="text-input draft-textarea"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={9}
        />
      </label>
      {note && <div className="error-banner">{note}</div>}
      <div className="button-row">
        <button
          className="btn btn-primary"
          disabled={busy || !lead.contactEmail}
          onClick={async () => {
            setBusy(true);
            setNote(null);
            try {
              if (dirty) await updateDraft({ leadId: lead._id, subject, draftText: body });
              await approve({ leadId: lead._id });
              onSent?.();
            } catch (err) {
              setNote(err instanceof Error ? err.message : String(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Sending…" : "Approve & send"}
        </button>
        <button
          className="btn btn-secondary"
          disabled={busy || !dirty}
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
          Save changes
        </button>
        <span className="muted-note">To: {lead.contactEmail ?? "no contact found"}</span>
      </div>
    </div>
  );
}

function LeadModal({
  row,
  businessName,
  now,
  onClose,
}: {
  row: LeadRow;
  businessName: string;
  now: number;
  onClose: () => void;
}) {
  const { lead } = row;
  const data = useQuery(api.outreach.getForLead, { leadId: lead._id });
  const followUpNow = useMutation(api.outreach.followUpNow);
  const markWon = useMutation(api.leads.markWon);
  const skip = useMutation(api.leads.skip);
  const [busy, setBusy] = useState(false);

  const outreach = data?.outreach ?? null;
  const messages = data?.messages ?? [];
  const canFollowUp =
    outreach?.sentAt !== undefined &&
    outreach?.followUpSentAt === undefined &&
    outreach?.lastReplyAt === undefined;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <span className="lead-name">{lead.name}</span>
            <span className={`type-tag type-${lead.type}`}>{TYPE_LABEL[lead.type]}</span>
            <span className={`badge badge-${lead.status}`}>{STATUS_LABEL[lead.status]}</span>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          {lead.relevanceNote && <p className="lead-why">{lead.relevanceNote}</p>}
          {(lead.address || lead.url) && (
            <div className="muted-note">
              {lead.address}
              {lead.address && lead.url ? " · " : ""}
              {lead.url && (
                <a href={lead.url} target="_blank" rel="noreferrer">
                  {lead.url}
                </a>
              )}
            </div>
          )}

          {lead.evidence && (
            <div className="evidence">
              <div className="section-label">Why the agent picked them</div>
              <blockquote>{lead.evidence}</blockquote>
            </div>
          )}

          {data === undefined ? (
            <div className="muted-note">Loading…</div>
          ) : (
            <>
              {outreach && outreach.sentAt === undefined && outreach.draftStatus === "ready" && (
                <DraftEditor lead={lead} outreach={outreach} />
              )}
              {outreach && outreach.sentAt === undefined && outreach.draftStatus === "generating" && (
                <div className="muted-note">
                  <span className="spinner" /> Drafting personalized outreach…
                </div>
              )}
              {outreach && outreach.draftStatus === "failed" && outreach.sentAt === undefined && (
                <div className="error-banner">Draft generation failed — see the Activity tab.</div>
              )}
              {!lead.contactEmail && (
                <div className="muted-note">
                  No contact email was found on their site, so the agent can't email them
                  automatically.
                </div>
              )}

              {messages.length > 0 && (
                <ThreadView messages={messages} businessName={businessName} leadName={lead.name} />
              )}

              {canFollowUp && outreach?.nextActionAt !== undefined && (
                <div className="followup-line">
                  <span>
                    Follow-up scheduled for {formatWhen(outreach.nextActionAt)} (in{" "}
                    {formatCountdown(outreach.nextActionAt - now)})
                  </span>
                  <button
                    className="btn btn-secondary btn-sm"
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
            </>
          )}
        </div>
        <div className="modal-footer">
          {lead.status !== "won" && lead.status !== "skipped" && (
            <button className="btn btn-success btn-sm" onClick={() => void markWon({ leadId: lead._id })}>
              Mark won
            </button>
          )}
          {(lead.status === "sourced" || lead.status === "approved") && (
            <button className="btn btn-ghost btn-sm" onClick={() => void skip({ leadId: lead._id })}>
              Skip this lead
            </button>
          )}
          <button className="btn btn-secondary btn-sm modal-footer-close" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function LeadCard({ row, now, onOpen }: { row: LeadRow; now: number; onOpen: () => void }) {
  const { lead, outreach } = row;
  const approve = useMutation(api.leads.approve);
  const [busy, setBusy] = useState(false);

  const draftReady =
    lead.status === "sourced" &&
    !!lead.contactEmail &&
    outreach?.draftStatus === "ready" &&
    outreach.sentAt === undefined;
  const sent = outreach?.sentAt !== undefined;

  let actions: ReactNode;
  if (draftReady) {
    actions = (
      <>
        <button className="btn btn-secondary btn-sm" onClick={onOpen}>
          Review draft
        </button>
        <button
          className="btn btn-primary btn-sm"
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
          {busy ? "Sending…" : "Approve & send"}
        </button>
      </>
    );
  } else if (lead.status === "sourced" && outreach?.draftStatus === "generating") {
    actions = (
      <span className="muted-note">
        <span className="spinner" /> drafting…
      </span>
    );
  } else if (sent) {
    actions = (
      <button className="btn btn-secondary btn-sm" onClick={onOpen}>
        View thread
      </button>
    );
  } else {
    actions = (
      <button className="btn btn-ghost btn-sm" onClick={onOpen}>
        Details
      </button>
    );
  }

  return (
    <li
      key={`${lead._id}-${lead.status}-${outreach?.draftStatus ?? ""}`}
      className={`lead-card ${lead.status === "skipped" || lead.status === "cold" ? "lead-card-dim" : ""}`}
    >
      <div className="lead-main" onClick={onOpen} role="button" tabIndex={0}>
        <div className="lead-top">
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
          {lead.contactEmail ?? "no contact email found"}
          {sent &&
            outreach?.nextActionAt !== undefined &&
            outreach.followUpSentAt === undefined &&
            outreach.lastReplyAt === undefined && (
              <span className="followup-chip">
                follow-up in {formatCountdown(outreach.nextActionAt - now)}
              </span>
            )}
        </div>
      </div>
      <div className="lead-actions">{actions}</div>
    </li>
  );
}

function ActivityFeed({ businessId }: { businessId: Id<"businesses"> }) {
  const activity = useQuery(api.activity.list, { businessId });
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
  const remove = useMutation(api.businesses.remove);
  const inbox = useQuery(api.inbox.get);
  const [rescanBusy, setRescanBusy] = useState(false);
  const businessId = business._id;

  return (
    <div className="settings-panel">
      <div className="settings-row">
        <label className="field-label">
          Approval mode
          <select
            className="text-input"
            value={business.approvalMode}
            onChange={(e) =>
              void updateSettings({
                businessId,
                approvalMode: e.target.value as "approve_each" | "auto_send",
              })
            }
          >
            <option value="approve_each">I approve each email</option>
            <option value="auto_send">Auto-send drafts</option>
          </select>
        </label>
        <label className="field-label">
          Follow-up delay (days)
          <input
            className="text-input"
            type="number"
            min={1}
            max={30}
            value={business.followUpDelayDays}
            onChange={(e) =>
              void updateSettings({ businessId, followUpDelayDays: Number(e.target.value) })
            }
          />
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={business.weeklyRescan}
            onChange={(e) => void updateSettings({ businessId, weeklyRescan: e.target.checked })}
          />
          Weekly automatic rescan
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={business.autoReply !== false}
            onChange={(e) => void updateSettings({ businessId, autoReply: e.target.checked })}
          />
          Agent auto-replies to responses
        </label>
      </div>
      <div className="settings-footer">
        <span className="muted-note">
          Agent inbox: {inbox ? `${inbox.email} ✓` : "not set up yet"}
          {business.lastScanAt ? ` · last scan ${formatWhen(business.lastScanAt)}` : ""}
        </span>
        <div className="button-row">
          <button
            className="btn btn-secondary btn-sm"
            disabled={rescanBusy || business.status !== "ready"}
            onClick={async () => {
              setRescanBusy(true);
              try {
                await rescanNow({ businessId });
              } finally {
                setRescanBusy(false);
              }
            }}
          >
            Rescan the block now
          </button>
          <button
            className="btn btn-danger-ghost btn-sm"
            onClick={() => {
              if (window.confirm(`Remove ${business.name ?? business.url} and all its leads?`)) {
                void remove({ businessId });
              }
            }}
          >
            Remove business
          </button>
        </div>
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

function Dashboard({ business }: { business: BusinessDoc }) {
  const rows = useQuery(api.leads.list, { businessId: business._id }) ?? [];
  const approveAll = useMutation(api.leads.approveAll);
  const [tab, setTab] = useState<LeadDoc["type"] | "activity">("competitor");
  const [showSettings, setShowSettings] = useState(false);
  const [openLeadId, setOpenLeadId] = useState<Id<"leads"> | null>(null);
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
    rows.filter((r) => r.lead.type === type).sort((a, b) => (b.lead.score ?? 0) - (a.lead.score ?? 0));

  const countFor = (key: LeadDoc["type"] | "activity") =>
    key === "activity" ? null : rows.filter((r) => r.lead.type === key).length;

  const openRow = openLeadId ? (rows.find((r) => r.lead._id === openLeadId) ?? null) : null;

  return (
    <>
      <div className="dash-head">
        <div>
          <h2 className="dash-title">{business.name ?? business.url}</h2>
          {business.address && <div className="dash-sub">{business.address}</div>}
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => setShowSettings((s) => !s)}>
          {showSettings ? "Close settings" : "Settings"}
        </button>
      </div>

      {showSettings && <SettingsPanel business={business} />}

      {business.status === "sourcing" && (
        <div className="notice notice-scan">
          <span className="spinner" /> Scanning the block — leads appear below as each place is
          judged (capped at 5 minutes per scan).
        </div>
      )}

      <StatsStrip rows={rows} />

      {readyDrafts > 0 && business.approvalMode === "approve_each" && (
        <div className="notice notice-drafts">
          <span>
            <strong>{readyDrafts}</strong> outreach draft{readyDrafts === 1 ? "" : "s"} ready for
            your review
          </span>
          <button
            className="btn btn-primary btn-sm"
            disabled={approvingAll}
            onClick={async () => {
              setApprovingAll(true);
              try {
                await approveAll({ businessId: business._id });
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

      <main>
        {tab === "activity" ? (
          <ActivityFeed businessId={business._id} />
        ) : tabRows(tab).length === 0 ? (
          <p className="empty-note">
            {business.status === "sourcing"
              ? "Nothing judged in this category yet — watch the Activity tab."
              : "No leads in this category yet. Try a rescan from Settings."}
          </p>
        ) : (
          <ul className="lead-list">
            {tabRows(tab).map((row) => (
              <LeadCard
                key={row.lead._id}
                row={row}
                now={now}
                onOpen={() => setOpenLeadId(row.lead._id)}
              />
            ))}
          </ul>
        )}
      </main>

      {openRow && (
        <LeadModal
          row={openRow}
          businessName={business.name ?? "Your business"}
          now={now}
          onClose={() => setOpenLeadId(null)}
        />
      )}
    </>
  );
}

// ------------------------------------------------------------------ root

function Root() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const businesses = useQuery(api.businesses.list);
  const [selectedId, setSelectedId] = useState<Id<"businesses"> | null>(null);
  const [adding, setAdding] = useState(false);

  if (isLoading) return null;
  if (!isAuthenticated) return <SignInForm />;
  if (businesses === undefined || businesses === null) return null;

  const selected = businesses.find((b) => b._id === selectedId) ?? businesses[0] ?? null;
  const showOnboarding = adding || businesses.length === 0;

  return (
    <div className="app-shell">
      <TopBar
        businesses={businesses}
        selectedId={selected?._id ?? null}
        onSelect={(id) => {
          setSelectedId(id);
          setAdding(false);
        }}
        onAdd={() => setAdding(true)}
      />
      <div className="app-content">
        {showOnboarding ? (
          <Onboarding
            onCreated={(id) => {
              setSelectedId(id);
              setAdding(false);
            }}
            onCancel={businesses.length > 0 ? () => setAdding(false) : undefined}
          />
        ) : selected === null ? null : selected.status === "scraping" ? (
          <ProgressPanel business={selected} title="Reading the site…" />
        ) : selected.status === "confirm" ? (
          <ConfirmCard business={selected} />
        ) : selected.status === "failed" ? (
          <FailedCard business={selected} />
        ) : (
          <>
            <InboxBanner />
            <Dashboard business={selected} />
          </>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return <Root />;
}
