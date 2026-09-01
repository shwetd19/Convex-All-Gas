import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import type { FormEvent } from "react";
import { AlertCircle, ArrowRight, Loader2, MapPin } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/format";
import type { BusinessDoc } from "@/lib/types";

const STEPS = [
  {
    title: "Reads & locates",
    body: "The agent reads the site and pins the business on the map. You confirm it's the right one before anything runs.",
  },
  {
    title: "Maps the block & the market",
    body: "It scans every nearby place plus startup and B2B directories, judging each one: customers, competitors, complements, offices, events.",
  },
  {
    title: "Works the leads",
    body: "Personalized outreach drafted for your approval, sent from the agent's own inbox. Follow-ups, reply classification, and full threads live in here.",
  },
];

export function Onboarding({
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
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-8 py-10 text-center">
      <div className="space-y-3">
        <Badge className="gap-1.5 bg-primary/10 text-primary hover:bg-primary/10">
          <MapPin /> Agent-run local outreach
        </Badge>
        <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          Whose block are we mapping today?
        </h1>
        <p className="text-muted-foreground">
          Drop a business website. The agent takes it from there.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex w-full max-w-lg gap-2">
        <Input
          type="text"
          placeholder="yourbusiness.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          autoFocus
          required
          className="h-10 flex-1 text-base"
        />
        <Button type="submit" size="lg" disabled={submitting}>
          {submitting ? <Loader2 className="animate-spin" /> : null}
          {submitting ? "Starting…" : "Map my block"}
          {!submitting && <ArrowRight data-icon="inline-end" />}
        </Button>
      </form>

      {error && (
        <Alert variant="destructive" className="w-full max-w-lg text-left">
          <AlertCircle />
          <AlertTitle>Couldn't start</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {onCancel && (
        <Button variant="ghost" size="sm" type="button" onClick={onCancel}>
          Cancel
        </Button>
      )}

      <div className="grid w-full gap-3 text-left sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <Card key={s.title} size="sm" className="border-t-2 border-t-primary/60">
            <CardHeader>
              <div className="mb-1 flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {i + 1}
              </div>
              <CardTitle>{s.title}</CardTitle>
              <CardDescription>{s.body}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function ProgressPanel({ business, title }: { business: BusinessDoc; title: string }) {
  const activity = useQuery(api.activity.list, { businessId: business._id });
  const lines = (activity ?? []).slice(0, 6);
  return (
    <Card className="mx-auto w-full max-w-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin text-muted-foreground" /> {title}
        </CardTitle>
        <CardDescription>{business.url}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          {lines.length === 0 ? (
            <li>Starting up…</li>
          ) : (
            lines.map((a) => <li key={a._id}>{a.message}</li>)
          )}
        </ul>
      </CardContent>
    </Card>
  );
}

export function ConfirmCard({ business }: { business: BusinessDoc }) {
  const confirm = useMutation(api.businesses.confirm);
  const remove = useMutation(api.businesses.remove);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="mx-auto w-full max-w-xl">
      <CardHeader>
        <CardTitle>Is this you?</CardTitle>
        <CardDescription>Confirming avoids scanning the wrong neighborhood.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="text-lg font-semibold">{business.name ?? business.url}</div>
          {business.category && (
            <div className="text-sm text-muted-foreground">{business.category}</div>
          )}
          {business.address && (
            <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-3.5" /> {business.address}
            </div>
          )}
        </div>
        {business.description && <p className="text-sm">{business.description}</p>}
        {business.offerings && business.offerings.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {business.offerings.map((o) => (
              <Badge key={o} variant="secondary">
                {o}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
      <CardFooter className="gap-2">
        <Button disabled={busy} onClick={() => void run(() => confirm({ businessId: business._id }))}>
          Yes, scan my block
        </Button>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => void run(() => remove({ businessId: business._id }))}
        >
          Not me, remove
        </Button>
      </CardFooter>
    </Card>
  );
}

export function FailedCard({ business }: { business: BusinessDoc }) {
  const retry = useMutation(api.businesses.retryIntake);
  const remove = useMutation(api.businesses.remove);
  const [busy, setBusy] = useState(false);
  return (
    <Card className="mx-auto w-full max-w-xl">
      <CardHeader>
        <CardTitle>Setup failed</CardTitle>
        <CardDescription>{business.url}</CardDescription>
      </CardHeader>
      <CardContent>
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{business.error ?? "Something went wrong."}</AlertDescription>
        </Alert>
      </CardContent>
      <CardFooter className="gap-2">
        <Button
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
        </Button>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => void remove({ businessId: business._id })}
        >
          Remove this business
        </Button>
      </CardFooter>
    </Card>
  );
}
