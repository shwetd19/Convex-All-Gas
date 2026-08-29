import { query } from "./_generated/server";

// One reactive read for the whole dashboard: recent forwarded emails, each
// with its listings sorted best-match-first. Small dataset for a hackathon
// demo, so a per-email lookup here is simpler than denormalizing.
export const overview = query({
  args: {},
  handler: async (ctx) => {
    const emails = await ctx.db.query("emails").order("desc").take(20);
    const results = [];
    for (const email of emails) {
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
