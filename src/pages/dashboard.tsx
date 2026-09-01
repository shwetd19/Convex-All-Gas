import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { ActivityItem } from "@/components/activity-timeline";
import { ActivityTimeline } from "@/components/activity-timeline";
import { DraftsBanner } from "@/components/drafts-banner";
import { InboxBanner } from "@/components/inbox-banner";
import { LeadCard } from "@/components/lead-card";
import { LeadDialog } from "@/components/lead-dialog";
import { StatsStrip } from "@/components/stats-strip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage, formatWhen, initials, useNowTick } from "@/lib/format";
import { isDraftReady } from "@/lib/types";
import type { BusinessDoc, LeadRow, LeadType } from "@/lib/types";
import { cn } from "@/lib/utils";

type ProfileForm = {
  name: string;
  category: string;
  domain: string;
  teamSize: string;
  foundedYear: string;
  description: string;
  notes: string;
};

function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-[0.7rem] font-medium tracking-[0.18em] text-muted-foreground uppercase"
    >
      {children}
    </label>
  );
}

export function DashboardView({
  business,
  rows,
  activity,
  search,
  onSave,
  onGoTo,
}: {
  business: BusinessDoc;
  rows: LeadRow[];
  activity: ActivityItem[] | undefined;
  search: string;
  onSave: (form: ProfileForm) => Promise<void>;
  onGoTo: (type: LeadType) => void;
}) {
  const now = useNowTick(30_000);
  const initial: ProfileForm = {
    name: business.name ?? "",
    category: business.category ?? "",
    domain: business.domain ?? "",
    teamSize: business.teamSize ?? "",
    foundedYear: business.foundedYear ?? "",
    description: business.description ?? "",
    notes: business.notes ?? "",
  };
  const [form, setForm] = useState<ProfileForm>({
    name: business.name ?? "",
    category: business.category ?? "",
    domain: business.domain ?? "",
    teamSize: business.teamSize ?? "",
    foundedYear: business.foundedYear ?? "",
    description: business.description ?? "",
    notes: business.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [openLeadId, setOpenLeadId] = useState<Id<"leads"> | null>(null);

  const set = (key: keyof ProfileForm) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));
  const dirty = (Object.keys(initial) as (keyof ProfileForm)[]).some(
    (k) => form[k].trim() !== initial[k],
  );

  const save = async () => {
    setBusy(true);
    try {
      await onSave(form);
      toast.success("Profile saved");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const live = rows.filter((r) => r.lead.status !== "skipped");
  const readyDrafts = rows.filter(isDraftReady);
  const q = search.trim().toLowerCase();
  const customers = live
    .filter((r) => r.lead.type === "customer")
    .filter((r) => !q || `${r.lead.name} ${r.lead.relevanceNote ?? ""}`.toLowerCase().includes(q))
    .sort((a, b) => {
      const da = isDraftReady(a) ? 1 : 0;
      const db = isDraftReady(b) ? 1 : 0;
      if (da !== db) return db - da;
      return (b.lead.score ?? 0) - (a.lead.score ?? 0);
    })
    .slice(0, 4);
  const customerCount = live.filter((r) => r.lead.type === "customer").length;
  const openRow = openLeadId ? (rows.find((r) => r.lead._id === openLeadId) ?? null) : null;

  const scanning = business.status === "sourcing";
  const subtitle = [
    business.category,
    business.domain,
    `${live.length} lead${live.length === 1 ? "" : "s"} tracked`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="rounded-3xl border border-blue-100 bg-gradient-to-b from-sky-50 via-blue-50/70 to-blue-100/40 p-6 shadow-[0_8px_30px_-16px_rgba(37,99,235,0.35)] sm:p-7 dark:border-blue-900/50 dark:from-blue-950/60 dark:via-blue-950/40 dark:to-blue-950/20">
        <div className="flex flex-wrap items-start gap-5">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 to-amber-500 font-heading text-2xl font-bold text-amber-950 shadow-lg shadow-amber-500/30">
            {initials(business.name ?? business.url)}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-heading text-3xl font-bold tracking-tight">
              {business.name ?? business.url}
            </h1>
            <p className="mt-1 text-muted-foreground">{subtitle}</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge
              className={cn(
                "h-8 rounded-full px-3.5 text-sm font-semibold",
                scanning
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  : "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
              )}
            >
              {scanning ? "Agent scanning" : "Agent active"}
            </Badge>
            <Button size="lg" disabled={busy || !dirty} onClick={() => void save()}>
              {busy && <Loader2 className="animate-spin" />}
              {busy ? "Saving…" : dirty ? "Save profile" : "Saved"}
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <FieldLabel htmlFor="name">Company</FieldLabel>
            <Input
              id="name"
              className="h-12 rounded-xl border-white/60 bg-white/80 text-base shadow-sm dark:border-white/10 dark:bg-white/5"
              value={form.name}
              onChange={set("name")}
            />
          </div>
          <div className="space-y-2">
            <FieldLabel>Website</FieldLabel>
            <a
              href={business.url}
              target="_blank"
              rel="noreferrer"
              className="flex h-12 items-center justify-between gap-2 truncate rounded-xl border border-white/60 bg-white/80 px-3 text-base shadow-sm transition-colors hover:text-blue-700 dark:border-white/10 dark:bg-white/5"
            >
              <span className="truncate">{business.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>
              <ExternalLink className="size-4 shrink-0 text-muted-foreground" />
            </a>
          </div>
          <div className="space-y-2">
            <FieldLabel htmlFor="category">Category</FieldLabel>
            <Input
              id="category"
              className="h-12 rounded-xl border-white/60 bg-white/80 text-base shadow-sm dark:border-white/10 dark:bg-white/5"
              value={form.category}
              onChange={set("category")}
              placeholder="e.g. coffee shop, IT services"
            />
          </div>
        </div>
      </div>

      <InboxBanner />

      <StatsStrip rows={rows} now={now} />

      {readyDrafts.length > 0 && (
        <DraftsBanner
          count={readyDrafts.length}
          action={
            <Button variant="brand" size="lg" onClick={() => setOpenLeadId(readyDrafts[0].lead._id)}>
              Review drafts
            </Button>
          }
        />
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="font-heading text-2xl font-bold tracking-tight">Customers</h2>
            <Badge variant="secondary" className="h-6 rounded-full px-2.5 text-sm tabular-nums">
              {customerCount}
            </Badge>
            <Button
              variant="link"
              size="sm"
              className="ml-auto text-blue-600"
              onClick={() => onGoTo("customer")}
            >
              View all
            </Button>
          </div>
          {customers.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {scanning
                  ? "The agent is judging nearby places now. Customers will show up here first."
                  : q
                    ? "No customers match your search."
                    : "No customer leads yet. Try a rescan from Settings."}
              </CardContent>
            </Card>
          ) : (
            <ul className="space-y-3">
              {customers.map((r) => (
                <LeadCard
                  key={r.lead._id}
                  row={r}
                  now={now}
                  compact
                  onOpen={() => setOpenLeadId(r.lead._id)}
                />
              ))}
            </ul>
          )}
        </div>

        <Card className="self-start">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-blue-500" /> Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activity === undefined ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : activity.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                Nothing yet. The agent's work shows up here.
              </div>
            ) : (
              <ActivityTimeline items={activity.slice(0, 6)} now={now} />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>What you do</CardTitle>
          <CardDescription>Feeds every pitch the agent writes. Richer profile, better outreach.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            id="description"
            rows={4}
            className="rounded-xl text-base"
            value={form.description}
            onChange={set("description")}
            placeholder="What the business does, in a few sentences"
          />
          {business.offerings && business.offerings.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {business.offerings.map((o) => (
                <span
                  key={o}
                  className="rounded-full border border-blue-200 bg-white px-3.5 py-1.5 text-sm font-medium text-blue-700 dark:border-blue-800 dark:bg-transparent dark:text-blue-300"
                >
                  {o}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Company details</CardTitle>
          <CardDescription>
            {business.address ?? "No address on file."}
            {business.scrapedAt ? ` · Site read ${formatWhen(business.scrapedAt)}` : ""}
            {business.lastScanAt ? ` · Last scan ${formatWhen(business.lastScanAt)}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-3">
          <div className="space-y-2">
            <FieldLabel htmlFor="domain">Domain / industry</FieldLabel>
            <Input id="domain" className="h-11 rounded-xl" value={form.domain} onChange={set("domain")} placeholder="e.g. AI product engineering" />
          </div>
          <div className="space-y-2">
            <FieldLabel htmlFor="teamSize">Team size</FieldLabel>
            <Input id="teamSize" className="h-11 rounded-xl" value={form.teamSize} onChange={set("teamSize")} placeholder="e.g. 25-50" />
          </div>
          <div className="space-y-2">
            <FieldLabel htmlFor="founded">Founded</FieldLabel>
            <Input id="founded" className="h-11 rounded-xl" value={form.foundedYear} onChange={set("foundedYear")} placeholder="e.g. 2019" />
          </div>
          <div className="space-y-2 md:col-span-3">
            <FieldLabel htmlFor="notes">Notes for the agent</FieldLabel>
            <Textarea id="notes" rows={3} className="rounded-xl" value={form.notes} onChange={set("notes")} placeholder="Anything the agent should know or mention when pitching" />
          </div>
        </CardContent>
      </Card>

      {openRow && (
        <LeadDialog
          row={openRow}
          businessName={business.name ?? "Your business"}
          now={now}
          onClose={() => setOpenLeadId(null)}
        />
      )}
    </div>
  );
}

export function DashboardPage({
  business,
  rows,
  search,
  onGoTo,
}: {
  business: BusinessDoc;
  rows: LeadRow[];
  search: string;
  onGoTo: (type: LeadType) => void;
}) {
  const activity = useQuery(api.activity.list, { businessId: business._id });
  const updateProfile = useMutation(api.businesses.updateProfile);
  return (
    <DashboardView
      business={business}
      rows={rows}
      activity={activity}
      search={search}
      onGoTo={onGoTo}
      onSave={async (form) => {
        await updateProfile({ businessId: business._id, ...form });
      }}
    />
  );
}
