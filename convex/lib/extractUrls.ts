const URL_RE = /https?:\/\/[^\s"'<>)\]]+/gi;
const HREF_RE = /href\s*=\s*["']([^"']+)["']/gi;

const EXCLUDED_HOST_SUBSTRINGS = [
  "unsubscribe",
  "agentmail.to",
  "agentmail.eu",
  "mailto:",
  "list-manage.com",
  "sendgrid.net",
  "mailchimp.com",
  "awstrack.me",
  // Social profiles / app store links: never a listing, common noise in
  // marketing-style forwards, and wasteful to burn Firecrawl calls on.
  "twitter.com/",
  "x.com/",
  "facebook.com/",
  "instagram.com/",
  "apps.apple.com",
  "itunes.apple.com",
  "play.google.com",
  "apps.microsoft.com",
  "google.com/maps",
  "maps.google.com",
  "maps.app.goo.gl",
  // LinkedIn navigation chrome that rides along in every job-alert email —
  // keep linkedin.com/*/jobs/view/... (the actual postings) by only
  // excluding these specific non-listing paths.
  "linkedin.com/comm/feed",
  "linkedin.com/comm/messaging",
  "linkedin.com/comm/mynetwork",
  "linkedin.com/comm/notifications",
  "linkedin.com/comm/in/",
  "linkedin.com/help/",
  "linkedin.com/company/",
  "linkedin.com/comm/jobs/alerts",
  "linkedin.com/comm/jobs/search-results",
];

const EXCLUDED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".css", ".ico"];

function stripTrailingPunctuation(url: string): string {
  return url.replace(/[.,;:!?)\]]+$/, "");
}

function decodeHtmlEntities(url: string): string {
  return url.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
}

function isLikelyListingUrl(url: string): boolean {
  const lower = url.toLowerCase();
  if (EXCLUDED_HOST_SUBSTRINGS.some((s) => lower.includes(s))) return false;
  if (EXCLUDED_EXTENSIONS.some((ext) => lower.endsWith(ext))) return false;
  return true;
}

function extractHrefUrls(html: string): string[] {
  const urls: string[] = [];
  for (const match of html.matchAll(HREF_RE)) {
    if (/^https?:\/\//i.test(match[1])) urls.push(match[1]);
  }
  return urls;
}

/**
 * Marketing/notification emails attach a different tracking query string to
 * the same link every place it appears (company logo, title, "apply" button
 * all point at the same job but with distinct trk/eid/otpToken params), and
 * mix raw & HTML-entity-encoded ("&amp;") copies of the same URL. Dedupe on
 * origin+pathname — for the platforms these links come from, the path alone
 * (e.g. /jobs/view/4456216429/) identifies the actual page; the query string
 * is single-use tracking cruft. Keeps the first-seen full form so trailing
 * punctuation stripping etc. still has something concrete to work with.
 */
function dedupeByPath(urls: string[]): string[] {
  const seen = new Map<string, string>();
  for (const url of urls) {
    let key = url;
    try {
      const parsed = new URL(url);
      key = `${parsed.origin}${parsed.pathname}`;
    } catch {
      // Malformed URL — fall back to deduping on the raw string.
    }
    if (!seen.has(key)) seen.set(key, url);
  }
  return Array.from(seen.values());
}

/**
 * Pulls candidate listing URLs out of a forwarded email. Checks both parts:
 * many marketing-style emails ship a plaintext part that's mostly spam-filter
 * padding with no real links, while the actual links only exist as `href`s
 * in the HTML part — so relying on just one representation misses links the
 * other has.
 */
export function extractListingUrls(text: string, html?: string): string[] {
  const fromText = text.match(URL_RE) ?? [];
  const fromHtml = html ? extractHrefUrls(html) : [];
  const cleaned = [...fromText, ...fromHtml]
    .map(decodeHtmlEntities)
    .map(stripTrailingPunctuation)
    .filter(isLikelyListingUrl);
  return dedupeByPath(cleaned);
}

/**
 * Best-effort preference note: the forwarded email's first non-quoted,
 * non-blank line that isn't itself a URL. Forwarded content usually starts
 * with "---------- Forwarded message ---------" or similar; anything above
 * that line is the user's own note.
 */
export function extractPreferenceNote(body: string): string | undefined {
  const forwardMarkerRe = /^-{2,}\s*forwarded message\s*-{2,}$/i;
  const lines = body.split(/\r?\n/);
  const noteLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (noteLines.length > 0) break;
      continue;
    }
    if (forwardMarkerRe.test(trimmed)) break;
    if (trimmed.startsWith(">")) break;
    if (/^https?:\/\//i.test(trimmed)) continue;
    noteLines.push(trimmed);
  }
  const note = noteLines.join(" ").trim();
  return note.length > 0 ? note : undefined;
}

/**
 * The part of a reply the user actually typed: everything above the first
 * quoted line ("> ...") or mail-client attribution ("On <date>, X wrote:").
 * Replies to a digest quote the whole digest underneath, and that quoted
 * text contains every listing URL and number — parsing it would re-ingest
 * the digest's own links and mis-read "#2" from the quoted list.
 */
export function extractReplyText(text: string): string {
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith(">")) break;
    if (/^On .+wrote:\s*$/i.test(trimmed)) break;
    if (/^-{2,}\s*(original|forwarded) message\s*-{2,}$/i.test(trimmed)) break;
    kept.push(line);
  }
  return kept.join("\n").trim();
}

export type FeedbackKind = "skip" | "more" | "less";
export type ParsedFeedback = { kind: FeedbackKind; index: number };

// "skip #2", "skip 2", "not 2", "remove #2", "no more like #2", "less like 3",
// "more like #3", "more of 3". Numbers are 1-based as printed in the digest.
const FEEDBACK_RES: [FeedbackKind, RegExp][] = [
  ["more", /\b(?:more\s+(?:of|like|to)?|similar\s+to)\s*#?\s*(\d{1,2})\b/gi],
  ["less", /\b(?:less|fewer)\s+(?:of|like)?\s*#?\s*(\d{1,2})\b/gi],
  ["skip", /\b(?:skip|not|remove|drop|hide|ignore|no)\s+(?:interested\s+in\s+)?#?\s*(\d{1,2})\b/gi],
];

/**
 * Cheap first-pass intent parse over the user's own reply text. Returns
 * [] when nothing matched, in which case the caller can fall back to an
 * LLM. "no more like #2" is negated "more" → mapped to "skip" by matching
 * the skip pattern first on that phrase.
 */
export function parseFeedback(replyText: string): ParsedFeedback[] {
  const out: ParsedFeedback[] = [];
  const seen = new Set<string>();
  // Negated "more": "no more like 2" / "not more of 2" → skip.
  for (const m of replyText.matchAll(/\b(?:no|not)\s+more\s+(?:of|like)?\s*#?\s*(\d{1,2})\b/gi)) {
    const key = `skip:${m[1]}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ kind: "skip", index: Number(m[1]) });
    }
  }
  for (const [kind, re] of FEEDBACK_RES) {
    for (const m of replyText.matchAll(re)) {
      const idx = Number(m[1]);
      if (idx < 1 || seen.has(`skip:${idx}`) && kind === "more") continue;
      const key = `${kind}:${idx}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ kind, index: idx });
    }
  }
  return out;
}

export type ListingCategory = "jobs" | "flats" | "newsletter" | "other";

const IMMEDIATE_DIGEST_RE = /\b(now|digest)\b/i;
const FORWARD_SUBJECT_RE = /^\s*(fwd?|fw)\s*:/i;

const CATEGORY_KEYWORDS: [ListingCategory, RegExp][] = [
  ["jobs", /\bjobs?\b/i],
  ["flats", /\bflats?\b|\bapartments?\b/i],
  ["newsletter", /\bnewsletters?\b/i],
];

/**
 * "Send now" override, checked against the user's own note and — only when
 * it's NOT a forward — the subject. A forwarded email's subject belongs to
 * whoever originally sent it (job alerts routinely end in "...Apply Now.",
 * "...12 more jobs..."), so trusting it would fire on nearly every forward;
 * a subject the user typed themselves (no "Fwd:"/"Fw:" prefix) is exactly
 * how the "digest now" no-links command email is meant to work, so that
 * stays trusted. An optional category keyword ("jobs now", "flats digest")
 * scopes the immediate send to just that category, leaving the rest pending
 * for the normal batch.
 */
export function parseDigestCommand(
  subject: string | undefined,
  preferenceNote: string | undefined,
): { immediate: boolean; category?: ListingCategory } {
  const trustedSubject = subject && !FORWARD_SUBJECT_RE.test(subject) ? subject : "";
  const text = `${trustedSubject} ${preferenceNote ?? ""}`;
  if (!IMMEDIATE_DIGEST_RE.test(text)) return { immediate: false };
  for (const [category, re] of CATEGORY_KEYWORDS) {
    if (re.test(text)) return { immediate: true, category };
  }
  return { immediate: true };
}
