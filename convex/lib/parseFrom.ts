/**
 * AgentMail's `from` field is a raw header value like
 * `"Shwetas Dhake <shwetasdhake16@gmail.com>"`. Pulls out just the address,
 * lowercased, for matching against a signed-in user's account email.
 */
export function extractEmailAddress(from: string): string {
  const match = from.match(/<([^>]+)>/);
  const raw = match ? match[1] : from;
  return raw.trim().toLowerCase();
}
