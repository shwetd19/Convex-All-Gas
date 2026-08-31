import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Sends the single follow-up when a lead has gone quiet, and marks leads
// cold after the follow-up also goes unanswered.
crons.interval("outreach follow-up sweep", { minutes: 15 }, internal.maintenance.followUpSweep, {});

// The standing job: re-source every opted-in business weekly (Mondays
// 15:00 UTC) so new competitors/events surface with zero user input.
crons.cron("weekly lead rescan", "0 15 * * 1", internal.maintenance.weeklyRescan, {});

export default crons;
