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
    const mine = allEmails.filter((e) => extractEmailAddress(e.from) === myEmail).slice(0, 20);

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
