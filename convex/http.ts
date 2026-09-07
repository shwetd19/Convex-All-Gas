import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { components, internal } from "./_generated/api";
import { agentmail } from "./email";
import { auth } from "./auth";

const http = httpRouter();

auth.addHttpRoutes(http);

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );

// CAN-SPAM opt-out landing. Every cold email links here; visiting it adds the
// address to the global suppression list so it's never contacted again.
http.route({
  path: "/unsubscribe",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const email = new URL(req.url).searchParams.get("email") ?? "";
    if (email) await ctx.runMutation(internal.suppressions.add, { email, source: "unsubscribe" });
    const who = email ? escapeHtml(email) : "This address";
    const body = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribed</title></head><body style="font-family:system-ui,sans-serif;max-width:480px;margin:80px auto;padding:0 24px;text-align:center;color:#0f172a"><h2 style="margin-bottom:8px">You're unsubscribed</h2><p style="color:#475569">${who} won't receive any further outreach. You can close this tab.</p></body></html>`;
    return new Response(body, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }),
});

http.route({
  path: "/agentmail/webhook",
  method: "POST",
  // See the matching cast in convex/ai.ts: @agentmail/convex's RunMutationCtx
  // type predates Convex's optional `transactionLimits` runMutation overload.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: httpAction(async (ctx, req) => agentmail.handleWebhook(ctx as any, req)),
});

// Keeps the routes above at the root; static assets are served from
// whatever's left over.
registerStaticRoutes(http, components.staticHosting);

export default http;
