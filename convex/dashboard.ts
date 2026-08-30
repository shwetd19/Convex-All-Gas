import { query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { extractEmailAddress } from "./lib/parseFrom";

// One shared AgentMail inbox serves every signed-in user (see PLAN.md — no
// per-user inboxes). "User-specific" here means: only show the emails you
// personally forwarded, matched by comparing the forwarded email's From:
// address against your signed-in account email. Returns null when signed
// out so the frontend can show a sign-in screen instead of an empty state.
export const overview = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user?.email) return null;
    const myEmail = user.email.toLowerCase();

    const allEmails = await ctx.db.query("emails").order("desc").collect();
    const mine = allEmails
      .filter((e) => !e.isFeedback && extractEmailAddress(e.from) === myEmail)
      .slice(0, 20);

    const results = [];
    for (const email of mine) {
      const listings = await ctx.db
        .query("listings")
        .withIndex("by_email", (q) => q.eq("emailId", email._id))
        .collect();
      listings.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
      results.push({ email, listings });
    }
    return results;
  },
});

// The signed-in user's sent digests, newest first. A digest row only
// records the thread it was sent in, so ownership is resolved by looking
// up an email in that thread and matching its From: address.
export const digestHistory = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user?.email) return null;
    const myEmail = user.email.toLowerCase();

    const digests = await ctx.db.query("digests").order("desc").take(50);
    const mine = [];
    for (const digest of digests) {
      const email = await ctx.db
        .query("emails")
        .withIndex("by_thread", (q) => q.eq("agentmailThreadId", digest.agentmailThreadId))
        .first();
      if (email && extractEmailAddress(email.from) === myEmail) {
        mine.push({ ...digest, subject: email.subject });
      }
      if (mine.length >= 10) break;
    }
    return mine;
  },
});
