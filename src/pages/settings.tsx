import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import type { ReactNode } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { errorMessage, formatWhen } from "@/lib/format";
import type { BusinessDoc } from "@/lib/types";

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
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-0.5">
        <div className="text-sm font-medium">{title}</div>
        {description && (
          <div className="max-w-xl text-sm text-muted-foreground">{description}</div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

export function SettingsPage({ business }: { business: BusinessDoc }) {
  const updateSettings = useMutation(api.businesses.updateSettings);
  const rescanNow = useMutation(api.businesses.rescanNow);
  const remove = useMutation(api.businesses.remove);
  const inbox = useQuery(api.inbox.get);
  const [rescanBusy, setRescanBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const businessId = business._id;

  const update = async (patch: Parameters<typeof updateSettings>[0]) => {
    try {
      await updateSettings(patch);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description={business.name ?? business.url} />

      <Card>
        <CardHeader>
          <CardTitle>Outreach</CardTitle>
          <CardDescription>How drafted emails go out and when the agent follows up.</CardDescription>
        </CardHeader>
        <CardContent>
          <SettingRow
            title="Approval mode"
            description="Whether drafted emails wait for your review or send as soon as they're ready."
          >
            <Select
              value={business.approvalMode}
              onValueChange={(v) =>
                void update({ businessId, approvalMode: v as "approve_each" | "auto_send" })
              }
            >
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="approve_each">I approve each email</SelectItem>
                <SelectItem value="auto_send">Auto-send drafts</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
          <Separator />
          <SettingRow
            title="Follow-up delay"
            description="After this many quiet days the agent sends its one follow-up. Continued silence marks the lead cold."
          >
            <Input
              type="number"
              min={1}
              max={30}
              className="w-20"
              value={business.followUpDelayDays}
              onChange={(e) =>
                void update({ businessId, followUpDelayDays: Number(e.target.value) })
              }
            />
            <span className="text-sm text-muted-foreground">days</span>
          </SettingRow>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Autonomy</CardTitle>
          <CardDescription>Choose how much the agent does without asking.</CardDescription>
        </CardHeader>
        <CardContent>
          <SettingRow
            title="Auto-reply on your behalf"
            description="If you don't answer an inbound reply within 1 hour, the agent responds for you: proposes a next step, answers from your profile, or closes politely. Off by default."
          >
            <Switch
              checked={business.autoReply === true}
              onCheckedChange={(v) => void update({ businessId, autoReply: v })}
            />
          </SettingRow>
          <Separator />
          <SettingRow
            title="Weekly automatic rescan"
            description="Every Monday the agent re-scans the block and surfaces only genuinely new leads."
          >
            <Switch
              checked={business.weeklyRescan}
              onCheckedChange={(v) => void update({ businessId, weeklyRescan: v })}
            />
          </SettingRow>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Agent inbox & scanning</CardTitle>
        </CardHeader>
        <CardContent>
          <SettingRow
            title="Outbound address"
            description="All outreach and replies flow through this dedicated inbox, never your personal email."
          >
            {inbox ? (
              <Badge variant="secondary" className="gap-1.5 font-mono">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                {inbox.email}
              </Badge>
            ) : (
              <span className="text-sm text-muted-foreground">Not set up yet</span>
            )}
          </SettingRow>
          <Separator />
          <SettingRow
            title="Block scan"
            description={
              business.lastScanAt
                ? `Last scan ${formatWhen(business.lastScanAt)}. Rescans dedupe, so only new places become leads.`
                : "No scan completed yet."
            }
          >
            <Button
              variant="outline"
              size="sm"
              disabled={rescanBusy || business.status !== "ready"}
              onClick={async () => {
                setRescanBusy(true);
                try {
                  await rescanNow({ businessId });
                  toast.success("Rescan started");
                } catch (err) {
                  toast.error(errorMessage(err));
                } finally {
                  setRescanBusy(false);
                }
              }}
            >
              {rescanBusy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              {rescanBusy ? "Starting…" : "Rescan the block now"}
            </Button>
          </SettingRow>
        </CardContent>
      </Card>

      <Card className="ring-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">Danger zone</CardTitle>
        </CardHeader>
        <CardContent>
          <SettingRow
            title="Remove this business"
            description="Deletes the business with all its leads, threads, and activity. This can't be undone."
          >
            <Button variant="destructive" size="sm" onClick={() => setConfirmOpen(true)}>
              Remove business
            </Button>
          </SettingRow>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {business.name ?? business.url}?</DialogTitle>
            <DialogDescription>
              This deletes the business with all its leads, threads, and activity. It can't be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={removing}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={removing}
              onClick={async () => {
                setRemoving(true);
                try {
                  await remove({ businessId });
                } catch (err) {
                  toast.error(errorMessage(err));
                  setRemoving(false);
                }
              }}
            >
              {removing && <Loader2 className="animate-spin" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
