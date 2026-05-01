export type WebhookResult = { ok: true } | { ok: false; error: string }

type Args = { title: string; text: string; themeColor?: string }

/**
 * Posts a MessageCard to a Microsoft Teams Connector webhook URL.
 *
 * Designed to be called fire-and-forget from the dispatcher — never throws;
 * all failure modes are captured in the returned WebhookResult.
 */
export async function sendTeams(webhookUrl: string, args: Args): Promise<WebhookResult> {
  const body = {
    '@type': 'MessageCard',
    '@context': 'https://schema.org/extensions',
    themeColor: args.themeColor ?? '0078D7',
    title: args.title,
    text: args.text,
  }
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) return { ok: false, error: `Teams webhook returned HTTP ${res.status}` }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
