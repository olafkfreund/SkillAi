export type WebhookResult = { ok: true } | { ok: false; error: string }

/**
 * Posts a plain-text message to a Slack incoming webhook URL.
 *
 * Designed to be called fire-and-forget from the dispatcher — never throws;
 * all failure modes are captured in the returned WebhookResult.
 */
export async function sendSlack(webhookUrl: string, text: string): Promise<WebhookResult> {
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (!res.ok) return { ok: false, error: `Slack webhook returned HTTP ${res.status}` }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
