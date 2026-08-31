/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activity from "../activity.js";
import type * as auth from "../auth.js";
import type * as businesses from "../businesses.js";
import type * as crons from "../crons.js";
import type * as email from "../email.js";
import type * as http from "../http.js";
import type * as inbox from "../inbox.js";
import type * as leads from "../leads.js";
import type * as lib_agentmailRest from "../lib/agentmailRest.js";
import type * as lib_parseFrom from "../lib/parseFrom.js";
import type * as lib_places from "../lib/places.js";
import type * as lib_text from "../lib/text.js";
import type * as maintenance from "../maintenance.js";
import type * as outreach from "../outreach.js";
import type * as pipeline from "../pipeline.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activity: typeof activity;
  auth: typeof auth;
  businesses: typeof businesses;
  crons: typeof crons;
  email: typeof email;
  http: typeof http;
  inbox: typeof inbox;
  leads: typeof leads;
  "lib/agentmailRest": typeof lib_agentmailRest;
  "lib/parseFrom": typeof lib_parseFrom;
  "lib/places": typeof lib_places;
  "lib/text": typeof lib_text;
  maintenance: typeof maintenance;
  outreach: typeof outreach;
  pipeline: typeof pipeline;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  firecrawl: import("@firecrawl/firecrawl-convex/_generated/component.js").ComponentApi<"firecrawl">;
  agentmail: import("@agentmail/convex/_generated/component.js").ComponentApi<"agentmail">;
  staticHosting: import("@convex-dev/static-hosting/_generated/component.js").ComponentApi<"staticHosting">;
};
