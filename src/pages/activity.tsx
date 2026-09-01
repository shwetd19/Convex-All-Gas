import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { ActivityTimeline } from "@/components/activity-timeline";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useNowTick } from "@/lib/format";

export function ActivityPage({ businessId }: { businessId: Id<"businesses"> }) {
  const activity = useQuery(api.activity.list, { businessId });
  const now = useNowTick(30_000);
  return (
    <div className="space-y-6">
      <PageHeader title="Activity" description="Live log of everything the agent does." />
      {activity === undefined ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-3/4" />
        </div>
      ) : activity.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nothing yet. Activity shows up here as the agent works.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-2">
            <ActivityTimeline items={activity} now={now} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
