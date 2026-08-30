import { defineApp } from "convex/server";
import { v } from "convex/values";
import firecrawl from "@firecrawl/firecrawl-convex/convex.config";
import agentmail from "@agentmail/convex/convex.config";
import staticHosting from "@convex-dev/static-hosting/convex.config";

// Only one-shot scrape() is used (no durable crawls), so no webhook route
// needs to be mounted for Firecrawl here.
//
// AGENTMAIL_API_KEY/AGENTMAIL_BASE_URL are wired the same way: the installed
// @agentmail/convex@0.1.0 package reads process.env.AGENTMAIL_API_KEY inside
// its own component context but its defineComponent() call never declares
// that env var, so there's no way to grant it access without this — patched
// locally in node_modules (see patches/) to declare the same two vars this
// app.use() wires in.
const app = defineApp({
  env: {
    FIRECRAWL_API_KEY: v.string(),
    AGENTMAIL_API_KEY: v.string(),
    AGENTMAIL_BASE_URL: v.optional(v.string()),
  },
});

app.use(firecrawl, {
  env: {
    FIRECRAWL_API_KEY: app.env.FIRECRAWL_API_KEY,
  },
});

app.use(agentmail, {
  env: {
    AGENTMAIL_API_KEY: app.env.AGENTMAIL_API_KEY,
    AGENTMAIL_BASE_URL: app.env.AGENTMAIL_BASE_URL,
  },
});

// Serves the built frontend from this deployment's convex.site URL.
app.use(staticHosting); // keep app HTTP routes at root

export default app;
