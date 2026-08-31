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

/**
 * Plain-text email body → simple, deliverability-friendly HTML: paragraphs,
 * line breaks, and "- " bullet groups. Used alongside the text part so
 * outgoing mail renders cleanly in real clients.
 */
export function textToHtml(text: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const blocks = text.trim().split(/\n{2,}/);
  const html = blocks
    .map((block) => {
      const lines = block.split("\n");
      if (lines.length > 1 && lines.every((l) => l.trim().startsWith("- "))) {
        const items = lines
          .map((l) => `<li style="margin:0 0 4px">${esc(l.trim().slice(2))}</li>`)
          .join("");
        return `<ul style="margin:0 0 14px;padding-left:20px">${items}</ul>`;
      }
      return `<p style="margin:0 0 14px">${lines.map(esc).join("<br/>")}</p>`;
    })
    .join("");
  return `<div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#111827;max-width:560px">${html}</div>`;
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
