// The global opt-out (suppression) list. Once an address is suppressed — via
// the unsubscribe link or a hard bounce — no business ever cold-emails it
// again. Checked in the pipeline before every initial send and follow-up.

import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

const normalize = (email: string) => email.trim().toLowerCase();

export const isSuppressed = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const e = normalize(email);
    if (!e) return false;
    const row = await ctx.db
      .query("suppressions")
      .withIndex("by_email", (q) => q.eq("email", e))
      .first();
    return row !== null;
  },
});

export const add = internalMutation({
  args: { email: v.string(), reason: v.optional(v.string()), source: v.optional(v.string()) },
  handler: async (ctx, { email, reason, source }) => {
    const e = normalize(email);
    if (!e) return;
    const existing = await ctx.db
      .query("suppressions")
      .withIndex("by_email", (q) => q.eq("email", e))
      .first();
    if (existing) return;
    await ctx.db.insert("suppressions", { email: e, reason, source: source ?? "manual" });
  },
});
