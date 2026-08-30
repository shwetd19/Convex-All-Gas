const URL_RE = /https?:\/\/[^\s"'<>)\]]+/gi;

const EXCLUDED_HOST_SUBSTRINGS = [
  "unsubscribe",
  "agentmail.to",
  "agentmail.eu",
  "mailto:",
  "list-manage.com",
  "sendgrid.net",
  "mailchimp.com",
];

const EXCLUDED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".css", ".ico"];

function stripTrailingPunctuation(url: string): string {
  return url.replace(/[.,;:!?)\]]+$/, "");
}

function isLikelyListingUrl(url: string): boolean {
  const lower = url.toLowerCase();
  if (EXCLUDED_HOST_SUBSTRINGS.some((s) => lower.includes(s))) return false;
  if (EXCLUDED_EXTENSIONS.some((ext) => lower.endsWith(ext))) return false;
  return true;
}

/**
 * Pulls candidate listing URLs out of a forwarded email body (text or HTML).
 * Preference notes ride along as plain text in the same body, so this only
 * extracts URLs — the preference note is parsed separately.
 */
export function extractListingUrls(body: string): string[] {
  const matches = body.match(URL_RE) ?? [];
  const cleaned = matches.map(stripTrailingPunctuation).filter(isLikelyListingUrl);
  return Array.from(new Set(cleaned));
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

export type ListingCategory = "jobs" | "flats" | "newsletter" | "other";

const IMMEDIATE_DIGEST_RE = /\b(now|digest)\b/i;

const CATEGORY_KEYWORDS: [ListingCategory, RegExp][] = [
  ["jobs", /\bjobs?\b/i],
  ["flats", /\bflats?\b|\bapartments?\b/i],
  ["newsletter", /\bnewsletters?\b/i],
];

/**
 * "Send now" override, checked against the subject and the user's own note
 * (not the full body, which may quote forwarded ad copy containing these
 * words incidentally). An optional category keyword ("jobs now", "flats
 * digest") scopes the immediate send to just that category, leaving the
 * rest pending for the normal batch.
 */
export function parseDigestCommand(
  subject: string | undefined,
  preferenceNote: string | undefined,
): { immediate: boolean; category?: ListingCategory } {
  const text = `${subject ?? ""} ${preferenceNote ?? ""}`;
  if (!IMMEDIATE_DIGEST_RE.test(text)) return { immediate: false };
  for (const [category, re] of CATEGORY_KEYWORDS) {
    if (re.test(text)) return { immediate: true, category };
  }
  return { immediate: true };
}
