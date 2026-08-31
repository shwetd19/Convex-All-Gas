import { v } from "convex/values";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { agentmailApiFetch } from "./lib/agentmailRest";

// Convex only lets a parent app call a mounted component's *public*
// functions via ctx.runAction/ctx.runQuery — @agentmail/convex's
// createInbox/listInboxes are internalActions, so they're unreachable this
// way. Inbox provisioning talks to AgentMail's REST API directly
// (lib/agentmailRest); sends and the webhook go through supported paths.

export const saveInbox = internalMutation({
  args: { inboxId: v.string(), email: v.string(), displayName: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("appInbox").first();
    if (existing) {
      await ctx.db.patch(existing._id, args);
    } else {
      await ctx.db.insert("appInbox", args);
    }
  },
});

// One dedicated outbound inbox for the whole app — outreach never sends
// from the user's personal inbox (PLAN.md guardrail). AgentMail issues both
// account-level API keys (can create inboxes) and per-inbox keys (403 on
// create, scoped to one inbox), so reuse whichever inbox the key sees
// before trying to create one.
export const provision = action({
  args: { username: v.optional(v.string()) },
  handler: async (ctx, { username }) => {
    const listResult: { inboxes?: any[] } = await agentmailApiFetch("/inboxes");
    const inboxes = listResult.inboxes ?? [];

    const inbox =
      inboxes.length > 0
        ? inboxes[0]
        : await agentmailApiFetch("/inboxes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, display_name: "Block Outreach" }),
          });

    await ctx.runMutation(internal.inbox.saveInbox, {
      inboxId: inbox.inbox_id,
      email: inbox.email,
      displayName: inbox.display_name,
    });

    return inbox;
  },
});

export const get = query({
  args: {},
  handler: (ctx) => ctx.db.query("appInbox").first(),
});

export const getInternal = internalQuery({
  args: {},
  handler: (ctx) => ctx.db.query("appInbox").first(),
});
