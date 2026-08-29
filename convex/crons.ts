import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "force-send stalled digests",
  { minutes: 5 },
  internal.maintenance.checkStalled,
);

export default crons;
