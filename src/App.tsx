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
type Page = LeadDoc["type"] | "activity" | "profile" | "settings";

const TYPE_LABEL: Record<LeadDoc["type"], string> = {
  competitor: "Competitor",
  complement: "Complement",
  office: "Office",
  event: "Event",
  customer: "Customer",
};

const LEAD_NAV: { key: LeadDoc["type"]; label: string }[] = [
  { key: "customer", label: "Customers" },
  { key: "competitor", label: "Competitors" },
  { key: "complement", label: "Complements" },
  { key: "office", label: "Offices" },
  { key: "event", label: "Events" },
];

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
  manual_reply: "Your reply",
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

// ---------------------------------------------------------------- sidebar

function NavIcon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    profile: (
      <>
        <path d="M3 21h18" />
        <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" />
        <path d="M9 8h1M14 8h1M9 12h1M14 12h1M10 21v-4h4v4" />
      </>
    ),
    customer: (
      <>
        <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    competitor: (
      <>
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" />
      </>
    ),
    complement: (
      <>
        <path d="M12 2 2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </>
    ),
    office: (
      <>
        <rect x="2" y="7" width="20" height="14" rx="2" />
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      </>
    ),
    event: (
      <>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </>
    ),
    activity: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
    settings: (
      <>
        <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
        <path d="M1 14h6M9 8h6M17 16h6" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="nav-icon"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function Sidebar({
  businesses,
  selectedId,
  onSelect,
  onAdd,
  page,
  setPage,
  rows,
}: {
  businesses: BusinessDoc[];
  selectedId: Id<"businesses"> | null;
  onSelect: (id: Id<"businesses">) => void;
  onAdd: () => void;
  page: Page;
  setPage: (p: Page) => void;
  rows: LeadRow[] | undefined;
}) {
  const me = useQuery(api.users.me);
  const { signOut } = useAuthActions();
  const countFor = (t: LeadDoc["type"]) => rows?.filter((r) => r.lead.type === t).length ?? 0;

  const item = (key: Page, label: string, icon: string, count?: number) => (
    <button
      key={key}
      className={`side-item ${page === key ? "side-item-active" : ""}`}
      onClick={() => setPage(key)}
    >
      <span className="side-item-left">
        <NavIcon name={icon} />
        <span>{label}</span>
      </span>
      {count !== undefined && <span className="side-count">{count}</span>}
    </button>
  );

  return (
    <aside className="sidebar">
      <div className="side-brand">
        <img src="/logo.svg" alt="" className="brand-logo" width="32" height="32" />
        <span className="brand-name">Block</span>
      </div>

      {businesses.length > 0 && (
        <div className="side-biz">
          <div className="side-section-label side-biz-label">Business</div>
          <select
            className="side-select"
            value={selectedId ?? businesses[0]._id}
            onChange={(e) => onSelect(e.target.value as Id<"businesses">)}
          >
            {businesses.map((b) => (
              <option key={b._id} value={b._id}>
                {b.name ?? b.url}
              </option>
            ))}
          </select>
          <button className="btn btn-secondary btn-sm side-add" onClick={onAdd}>
            + Add business
          </button>
        </div>
      )}

      <nav className="side-nav">
        <div className="side-section-label">Workspace</div>
        {item("profile", "Business profile", "profile")}
        <div className="side-section-label">Leads</div>
        {LEAD_NAV.map((t) => item(t.key, t.label, t.key, countFor(t.key)))}
        <div className="side-section-label">Agent</div>
        {item("activity", "Activity", "activity")}
        {item("settings", "Settings", "settings")}
      </nav>

      <div className="side-footer">
        {me && (
          <div className="side-user">
            <span className="avatar">{(me.email ?? "?").charAt(0).toUpperCase()}</span>
            <span className="account-email">{me.email}</span>
          </div>
        )}
        <button className="btn btn-ghost btn-sm" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </aside>
  );
}

// ------------------------------------------------------------ onboarding

function Onboarding({
  onCreated,
  onCancel,
}: {
  onCreated: (id: Id<"businesses">) => void;
  onCancel?: () => void;
}) {
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
        the surrounding block for customers, competitors, complements, offices, and events
        worth pitching — and drafts the outreach for you.
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

// --------------------------------------------------------------- profile

function ProfilePage({ business }: { business: BusinessDoc }) {
  const updateProfile = useMutation(api.businesses.updateProfile);
  const [form, setForm] = useState({
    name: business.name ?? "",
    category: business.category ?? "",
    domain: business.domain ?? "",
    teamSize: business.teamSize ?? "",
    foundedYear: business.foundedYear ?? "",
    description: business.description ?? "",
    notes: business.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setSaved(false);
  };

  const save = async () => {
    setBusy(true);
    try {
      await updateProfile({ businessId: business._id, ...form });
      setSaved(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <h2 className="page-title">Business profile</h2>
        <span className="page-sub">
          Everything here feeds the agent's outreach — richer profile, better pitches.
        </span>
      </div>
      <div className="profile-grid">
        <div className="profile-card profile-card-full">
          <div className="section-label">Identity</div>
          <div className="profile-row">
            <label className="field-label">
              Business name
              <input className="text-input" value={form.name} onChange={set("name")} />
            </label>
            <label className="field-label">
              Category
              <input
                className="text-input"
                value={form.category}
                onChange={set("category")}
                placeholder="e.g. coffee shop, IT services"
              />
            </label>
            <label className="field-label">
              Business domain / industry
              <input
                className="text-input"
                value={form.domain}
                onChange={set("domain")}
                placeholder="e.g. AI product engineering"
              />
            </label>
          </div>
          <div className="profile-meta">
            <a href={business.url} target="_blank" rel="noreferrer">
              {business.url}
            </a>
            {business.address ? ` · ${business.address}` : ""}
          </div>
        </div>

        <div className="profile-card">
          <div className="section-label">Company details</div>
          <div className="profile-row">
            <label className="field-label">
              Team size
              <input
                className="text-input"
                value={form.teamSize}
                onChange={set("teamSize")}
                placeholder="e.g. 25-50"
              />
            </label>
            <label className="field-label">
              Founded
              <input
                className="text-input"
                value={form.foundedYear}
                onChange={set("foundedYear")}
                placeholder="e.g. 2019"
              />
            </label>
          </div>
          <label className="field-label">
            Notes for the agent
            <textarea
              className="text-input profile-textarea"
              rows={4}
              value={form.notes}
              onChange={set("notes")}
              placeholder="Anything the agent should know or mention when pitching"
            />
          </label>
        </div>

        <div className="profile-card">
          <div className="section-label">What you do</div>
          <label className="field-label">
            Description
            <textarea
              className="text-input profile-textarea"
              rows={7}
              value={form.description}
              onChange={set("description")}
            />
          </label>
        </div>

        {business.offerings && business.offerings.length > 0 && (
          <div className="profile-card profile-card-full">
            <div className="section-label">Offerings — read from your site</div>
            <div className="chip-row">
              {business.offerings.map((o) => (
                <span key={o} className="offering-chip">
                  {o}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="profile-save">
        <span className="profile-meta">
          {business.scrapedAt ? `Site read ${formatWhen(business.scrapedAt)}` : ""}
          {business.lastScanAt ? ` · last scan ${formatWhen(business.lastScanAt)}` : ""}
        </span>
        <div className="button-row">
          {saved && <span className="saved-note">Saved ✓</span>}
          <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Save profile"}
          </button>
        </div>
      </div>
    </>
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
  const replyInThread = useMutation(api.outreach.replyInThread);
  const markWon = useMutation(api.leads.markWon);
  const skip = useMutation(api.leads.skip);
  const [busy, setBusy] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);

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
                <div className="error-banner">Draft generation failed — see the Activity page.</div>
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

              {outreach?.sentAt !== undefined && (
                <div className="reply-composer">
                  <div className="section-label">Reply as {businessName}</div>
                  <textarea
                    className="text-input draft-textarea"
                    rows={3}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={`Write your reply to ${lead.name}…`}
                  />
                  <div className="button-row">
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={replyBusy || !replyText.trim()}
                      onClick={async () => {
                        setReplyBusy(true);
                        try {
                          await replyInThread({ leadId: lead._id, text: replyText });
                          setReplyText("");
                        } finally {
                          setReplyBusy(false);
                        }
                      }}
                    >
                      {replyBusy ? "Sending…" : "Send reply"}
                    </button>
                    <span className="muted-note">
                      Sends from the agent inbox into this thread. (With auto-reply enabled in
                      Settings, the agent answers for you after 1 quiet hour.)
                    </span>
                  </div>
                </div>
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

function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="setting-row">
      <div className="setting-info">
        <div className="setting-title">{title}</div>
        {description && <div className="setting-desc">{description}</div>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`switch ${checked ? "switch-on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-knob" />
    </button>
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
    <div className="settings-stack">
      <div className="settings-card">
        <div className="settings-card-head">Outreach</div>
        <SettingRow
          title="Approval mode"
          description="Whether drafted emails wait for your review or send as soon as they're ready."
        >
          <select
            className="text-input setting-select"
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
        </SettingRow>
        <SettingRow
          title="Follow-up delay"
          description="After this many quiet days the agent sends its one follow-up; continued silence marks the lead cold."
        >
          <div className="setting-inline">
            <input
              className="text-input setting-number"
              type="number"
              min={1}
              max={30}
              value={business.followUpDelayDays}
              onChange={(e) =>
                void updateSettings({ businessId, followUpDelayDays: Number(e.target.value) })
              }
            />
            <span className="setting-suffix">days</span>
          </div>
        </SettingRow>
      </div>

      <div className="settings-card">
        <div className="settings-card-head">Autonomy</div>
        <SettingRow
          title="Auto-reply on your behalf"
          description="If you don't answer an inbound reply within 1 hour, the agent responds for you — proposes a next step, answers from your profile, or closes politely. Off by default; you choose how much autonomy to hand over."
        >
          <Toggle
            checked={business.autoReply === true}
            onChange={(v) => void updateSettings({ businessId, autoReply: v })}
          />
        </SettingRow>
        <SettingRow
          title="Weekly automatic rescan"
          description="Every Monday the agent re-scans the block and surfaces only genuinely new leads."
        >
          <Toggle
            checked={business.weeklyRescan}
            onChange={(v) => void updateSettings({ businessId, weeklyRescan: v })}
          />
        </SettingRow>
      </div>

      <div className="settings-card">
        <div className="settings-card-head">Agent inbox</div>
        <SettingRow
          title="Outbound address"
          description="All outreach and replies flow through this dedicated inbox — never your personal email."
        >
          {inbox ? (
            <span className="inbox-pill">
              <span className="inbox-dot" />
              {inbox.email}
            </span>
          ) : (
            <span className="muted-note">not set up yet</span>
          )}
        </SettingRow>
        <SettingRow
          title="Block scan"
          description={
            business.lastScanAt
              ? `Last scan ${formatWhen(business.lastScanAt)}. Rescans dedupe — only new places become leads.`
              : "No scan completed yet."
          }
        >
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
            {rescanBusy ? "Starting…" : "Rescan the block now"}
          </button>
        </SettingRow>
      </div>

      <div className="settings-card settings-card-danger">
        <div className="settings-card-head settings-card-head-danger">Danger zone</div>
        <SettingRow
          title="Remove this business"
          description="Deletes the business with all its leads, threads, and activity. This can't be undone."
        >
          <button
            className="btn btn-danger-outline btn-sm"
            onClick={() => {
              if (window.confirm(`Remove ${business.name ?? business.url} and all its leads?`)) {
                void remove({ businessId });
              }
            }}
          >
            Remove business
          </button>
        </SettingRow>
      </div>
    </div>
  );
}

function LeadPage({
  business,
  rows,
  type,
}: {
  business: BusinessDoc;
  rows: LeadRow[];
  type: LeadDoc["type"];
}) {
  const approveAll = useMutation(api.leads.approveAll);
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

  const pageRows = rows
    .filter((r) => r.lead.type === type)
    .sort((a, b) => (b.lead.score ?? 0) - (a.lead.score ?? 0));

  const openRow = openLeadId ? (rows.find((r) => r.lead._id === openLeadId) ?? null) : null;
  const label = LEAD_NAV.find((t) => t.key === type)?.label ?? type;

  return (
    <>
      <div className="page-head">
        <h2 className="page-title">{label}</h2>
        <span className="page-sub">
          {business.name ?? business.url}
          {business.address ? ` · ${business.address}` : ""}
        </span>
      </div>

      <InboxBanner />

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

      {pageRows.length === 0 ? (
        <p className="empty-note">
          {business.status === "sourcing"
            ? "Nothing judged in this category yet — watch the Activity page."
            : "No leads in this category yet. Try a rescan from Settings."}
        </p>
      ) : (
        <ul className="lead-list">
          {pageRows.map((row) => (
            <LeadCard key={row.lead._id} row={row} now={now} onOpen={() => setOpenLeadId(row.lead._id)} />
          ))}
        </ul>
      )}

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
  const [page, setPage] = useState<Page>("customer");

  const selected =
    businesses?.find((b) => b._id === selectedId) ?? (businesses ? businesses[0] : null) ?? null;
  const active = selected && (selected.status === "sourcing" || selected.status === "ready");
  const rows = useQuery(api.leads.list, active ? { businessId: selected._id } : "skip");

  if (isLoading) return null;
  if (!isAuthenticated) return <SignInForm />;
  if (businesses === undefined || businesses === null) return null;

  const showOnboarding = adding || businesses.length === 0;

  let content: ReactNode;
  if (showOnboarding) {
    content = (
      <Onboarding
        onCreated={(id) => {
          setSelectedId(id);
          setAdding(false);
        }}
        onCancel={businesses.length > 0 ? () => setAdding(false) : undefined}
      />
    );
  } else if (!selected) {
    content = null;
  } else if (selected.status === "scraping") {
    content = <ProgressPanel business={selected} title="Reading the site…" />;
  } else if (selected.status === "confirm") {
    content = <ConfirmCard business={selected} />;
  } else if (selected.status === "failed") {
    content = <FailedCard business={selected} />;
  } else if (page === "profile") {
    content = <ProfilePage key={selected._id} business={selected} />;
  } else if (page === "settings") {
    content = (
      <>
        <div className="page-head">
          <h2 className="page-title">Settings</h2>
          <span className="page-sub">{selected.name ?? selected.url}</span>
        </div>
        <SettingsPanel business={selected} />
      </>
    );
  } else if (page === "activity") {
    content = (
      <>
        <div className="page-head">
          <h2 className="page-title">Activity</h2>
          <span className="page-sub">Live log of everything the agent does</span>
        </div>
        <ActivityFeed businessId={selected._id} />
      </>
    );
  } else {
    content = <LeadPage business={selected} rows={rows ?? []} type={page} />;
  }

  return (
    <div className="layout">
      <Sidebar
        businesses={businesses}
        selectedId={selected?._id ?? null}
        onSelect={(id) => {
          setSelectedId(id);
          setAdding(false);
        }}
        onAdd={() => setAdding(true)}
        page={page}
        setPage={(p) => {
          setPage(p);
          setAdding(false);
        }}
        rows={rows ?? undefined}
      />
      <main className="main">
        <div className="main-inner">{content}</div>
      </main>
    </div>
  );
}

export default function App() {
  return <Root />;
}
