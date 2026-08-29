import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { agentmail } from "./email";

const http = httpRouter();

http.route({
  path: "/agentmail/webhook",
  method: "POST",
  // See the matching cast in convex/ai.ts: @agentmail/convex's RunMutationCtx
  // type predates Convex's optional `transactionLimits` runMutation overload.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: httpAction(async (ctx, req) => agentmail.handleWebhook(ctx as any, req)),
});

export default http;
