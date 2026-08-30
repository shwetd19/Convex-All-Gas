/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai from "../ai.js";
import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as dashboard from "../dashboard.js";
import type * as digest from "../digest.js";
import type * as email from "../email.js";
import type * as emails from "../emails.js";
import type * as http from "../http.js";
import type * as inbox from "../inbox.js";
import type * as lib_extractUrls from "../lib/extractUrls.js";
import type * as lib_parseFrom from "../lib/parseFrom.js";
import type * as listings from "../listings.js";
import type * as maintenance from "../maintenance.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ai: typeof ai;
  auth: typeof auth;
  crons: typeof crons;
  dashboard: typeof dashboard;
  digest: typeof digest;
  email: typeof email;
  emails: typeof emails;
  http: typeof http;
  inbox: typeof inbox;
  "lib/extractUrls": typeof lib_extractUrls;
  "lib/parseFrom": typeof lib_parseFrom;
  listings: typeof listings;
  maintenance: typeof maintenance;
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
