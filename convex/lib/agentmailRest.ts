// Direct REST access to AgentMail for the few things the component either
// can't do from a parent app (its internalActions don't resolve — see
// convex/inbox.ts) or doesn't cover (fetching a message body the webhook
// left out). Reads the same env vars the component uses.

const BASE_URL = () => process.env.AGENTMAIL_BASE_URL ?? "https://api.agentmail.to/v0";

export async function agentmailApiFetch(path: string, init?: RequestInit): Promise<any> {
  const apiKey = process.env.AGENTMAIL_API_KEY;
  if (!apiKey) {
    throw new Error(
      "AGENTMAIL_API_KEY is not set on this Convex deployment. Run `npx convex env set AGENTMAIL_API_KEY <key>`.",
    );
  }
  const res = await fetch(`${BASE_URL()}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AgentMail API error ${res.status}: ${text.slice(0, 500)}`);
  }
  return res.json();
}

/** Full message including text/html, regardless of size. */
export function fetchMessage(inboxId: string, messageId: string) {
  return agentmailApiFetch(
    `/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(messageId)}`,
  );
}
