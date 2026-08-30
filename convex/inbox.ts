import { v } from "convex/values";
import { action, internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { agentmailApiFetch } from "./lib/agentmailRest";

// Convex only lets a parent app call a mounted component's *public*
// functions via ctx.runAction/ctx.runQuery — @agentmail/convex's
// createInbox/listInboxes are internalActions, so they're unreachable this
// way (confirmed: calling any public component fn like lib.listCachedInboxes
// works, calling any internal one like lib.listInboxes throws "Couldn't
// resolve"). Everything else we use (replyToMessage → the public enqueueSend
// mutation, the webhook handler) doesn't hit this wall, so inbox
// provisioning talks to AgentMail's REST API directly (lib/agentmailRest).

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

// One inbox for the whole app — no multi-user auth for this MVP (see
// PLAN.md). Call this once to provision the demo inbox; the dashboard hides
// the "create inbox" button once one exists.
//
// AgentMail issues both account-level API keys (can create new inboxes) and
// per-inbox keys (403 on create, scoped to one already-existing inbox).
// Reuse whichever inbox the configured key is already scoped to before
// falling back to creating a new one.
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
            body: JSON.stringify({ username, display_name: "Listing Digest" }),
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
