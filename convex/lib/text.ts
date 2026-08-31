/**
 * The part of a reply the user actually typed: everything above the first
 * quoted line ("> ...") or mail-client attribution ("On <date>, X wrote:").
 * Ported from Sift — replies quote our whole outreach email underneath.
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

/** Crude but dependency-free HTML → text for HTML-only email bodies. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

// Addresses that show up in scraped pages but are never a real contact:
// image filenames matched by the loose regex, platform plumbing, examples.
const JUNK_EMAIL_SUBSTRINGS = [
  "example.",
  "sentry.",
  "wixpress.com",
  "godaddy.com",
  "sentry.io",
  "@2x.",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  "noreply",
  "no-reply",
  "donotreply",
];

/** Contact-email candidates from scraped page content, best-effort. */
export function extractEmails(content: string): string[] {
  const found = content.match(EMAIL_RE) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of found) {
    const email = raw.toLowerCase();
    if (seen.has(email)) continue;
    if (JUNK_EMAIL_SUBSTRINGS.some((s) => email.includes(s))) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}
