import nodemailer from 'nodemailer'
import { eq } from 'drizzle-orm'
import { withTenant } from '@/db'
import { tenantSettings } from '@/db/schema'
import { decrypt } from '@/lib/crypto'

export type SendResult = { ok: true } | { ok: false; error: string }

export interface SendOptions {
  to: string
  toName?: string
  from: string
  fromName: string
  subject: string
  bodyHtml: string
  bodyText: string
}

export interface Sender {
  send(opts: SendOptions): Promise<SendResult>
}

interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  fromEmail: string
  fromName: string
}

/**
 * SmtpSender — nodemailer-backed implementation of Sender.
 *
 * Config is passed at construction time (decrypted from tenant_settings
 * by getSenderForTenant). Errors are caught and returned as { ok: false }
 * rather than thrown so callers can always record the outcome.
 */
export class SmtpSender implements Sender {
  private readonly config: SmtpConfig

  constructor(config: SmtpConfig) {
    this.config = config
  }

  async send(opts: SendOptions): Promise<SendResult> {
    try {
      const transport = nodemailer.createTransport({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        auth: {
          user: this.config.user,
          pass: this.config.pass,
        },
      })

      const from = `"${this.config.fromName}" <${this.config.fromEmail}>`

      await transport.sendMail({
        from,
        to: opts.toName ? `"${opts.toName}" <${opts.to}>` : opts.to,
        subject: opts.subject,
        html: opts.bodyHtml,
        text: opts.bodyText,
      })

      return { ok: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { ok: false, error: message }
    }
  }
}

/**
 * getSenderForTenant — reads SMTP configuration from tenant_settings,
 * decrypts the password, and returns a ready SmtpSender.
 * Returns null if SMTP is not configured for the tenant.
 *
 * Keys consumed from tenant_settings:
 *   smtp_host, smtp_port, smtp_user, smtp_pass,
 *   smtp_from_email, smtp_from_name, smtp_secure
 */
export async function getSenderForTenant(tenantId: string): Promise<Sender | null> {
  const SMTP_KEYS = [
    'smtp_host',
    'smtp_port',
    'smtp_user',
    'smtp_pass',
    'smtp_from_email',
    'smtp_from_name',
    'smtp_secure',
  ] as const

  const rows = await withTenant(tenantId, async (tx) =>
    tx
      .select({ key: tenantSettings.key, value: tenantSettings.value })
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, tenantId))
  )

  // Build a lookup map
  const settings: Record<string, string> = {}
  for (const row of rows) {
    if (SMTP_KEYS.includes(row.key as (typeof SMTP_KEYS)[number])) {
      settings[row.key] = row.value
    }
  }

  const host = settings['smtp_host']
  const user = settings['smtp_user']
  const pass = settings['smtp_pass']
  const fromEmail = settings['smtp_from_email']

  // Minimum required: host, user, pass, from_email
  if (!host || !user || !pass || !fromEmail) return null

  let decryptedPass: string
  try {
    decryptedPass = decrypt(pass)
  } catch {
    return null
  }

  const port = settings['smtp_port'] ? parseInt(settings['smtp_port'], 10) : 587
  const secure = settings['smtp_secure'] === 'true'
  const fromName = settings['smtp_from_name'] ?? fromEmail

  return new SmtpSender({
    host,
    port: isNaN(port) ? 587 : port,
    secure,
    user,
    pass: decryptedPass,
    fromEmail,
    fromName,
  })
}
