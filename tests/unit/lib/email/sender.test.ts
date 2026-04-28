/**
 * Unit tests for src/lib/email/sender.ts
 *
 * Mocks: nodemailer, @/db (withTenant), @/lib/crypto (decrypt)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── nodemailer mock ────────────────────────────────────────────────────────────
const mockSendMail = vi.fn()
const mockCreateTransport = vi.fn()

vi.mock('nodemailer', () => ({
  default: {
    createTransport: (...args: unknown[]) => {
      mockCreateTransport(...args)
      return { sendMail: mockSendMail }
    },
  },
}))

// ── @/db mock ─────────────────────────────────────────────────────────────────
vi.mock('@/db', () => ({
  withTenant: vi.fn().mockImplementation(
    async (_tenantId: string, fn: (tx: unknown) => unknown) => {
      const chainable: Record<string, unknown> = {}
      const methods = ['select', 'from', 'where', 'limit', 'orderBy', 'returning', 'values', 'insert', 'update', 'delete']
      methods.forEach((m) => {
        chainable[m] = vi.fn().mockReturnValue(chainable)
      })
      ;(chainable as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve([]).then(resolve)
      return fn(chainable)
    }
  ),
}))

// ── @/lib/crypto mock ──────────────────────────────────────────────────────────
vi.mock('@/lib/crypto', () => ({
  decrypt: vi.fn((v: string) => `decrypted:${v}`),
  encrypt: vi.fn((v: string) => `encrypted:${v}`),
}))

// ── @/db/schema mock ──────────────────────────────────────────────────────────
vi.mock('@/db/schema', () => ({
  tenantSettings: { key: 'key', value: 'value', tenantId: 'tenant_id' },
  emailTemplates: {},
  sentEmails: {},
  candidates: {},
  scores: {},
  roles: {},
  users: {},
  tenants: {},
  customers: {},
}))

import { SmtpSender } from '@/lib/email/sender'

describe('SmtpSender', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls createTransport with the correct SMTP options', async () => {
    const sender = new SmtpSender({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      user: 'user@example.com',
      pass: 'secret',
      fromEmail: 'noreply@example.com',
      fromName: 'Recruiter',
    })

    mockSendMail.mockResolvedValueOnce({ messageId: 'abc123' })

    await sender.send({
      to: 'candidate@example.com',
      toName: 'Alice Smith',
      from: 'noreply@example.com',
      fromName: 'Recruiter',
      subject: 'Test subject',
      bodyHtml: '<p>Hello</p>',
      bodyText: 'Hello',
    })

    expect(mockCreateTransport).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      auth: { user: 'user@example.com', pass: 'secret' },
    })
  })

  it('returns { ok: true } when transport.sendMail resolves', async () => {
    const sender = new SmtpSender({
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      user: 'u',
      pass: 'p',
      fromEmail: 'from@example.com',
      fromName: 'Team',
    })

    mockSendMail.mockResolvedValueOnce({})

    const result = await sender.send({
      to: 'to@example.com',
      from: 'from@example.com',
      fromName: 'Team',
      subject: 'Hi',
      bodyHtml: '<p>Hi</p>',
      bodyText: 'Hi',
    })

    expect(result).toEqual({ ok: true })
  })

  it('returns { ok: false, error } when transport.sendMail rejects', async () => {
    const sender = new SmtpSender({
      host: 'smtp.broken.com',
      port: 587,
      secure: false,
      user: 'u',
      pass: 'p',
      fromEmail: 'from@example.com',
      fromName: 'Team',
    })

    mockSendMail.mockRejectedValueOnce(new Error('Connection refused'))

    const result = await sender.send({
      to: 'to@example.com',
      from: 'from@example.com',
      fromName: 'Team',
      subject: 'Hi',
      bodyHtml: '<p>Hi</p>',
      bodyText: 'Hi',
    })

    expect(result).toEqual({ ok: false, error: 'Connection refused' })
  })
})
