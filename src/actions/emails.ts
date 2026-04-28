'use server'

/**
 * Server actions for sending candidate emails and querying email history.
 *
 * sendCandidateEmail: the headline action — resolves candidate, template,
 * SMTP sender, substitutes variables, sends, and logs every attempt.
 *
 * listSentEmailsForCandidate: returns the send history for a candidate.
 *
 * seedTemplatesForCurrentTenant: admin convenience to seed default templates.
 */

import { eq, and, desc } from 'drizzle-orm'
import { withTenant } from '@/db'
import {
  candidates,
  emailTemplates,
  sentEmails,
  scores,
  roles,
  users,
  tenants,
  customers,
  tenantSettings,
} from '@/db/schema'
import type { SentEmail } from '@/db/schema'
import { requireRole } from '@/lib/auth/require-role'
import { writeAuditLog } from '@/lib/audit'
import { getActionContext } from '@/lib/auth/action-context'
import { getSenderForTenant } from '@/lib/email/sender'
import { substituteTemplate } from '@/lib/email/substitute'
import { seedDefaultTemplates } from '@/lib/email/seed-templates'

// ---------------------------------------------------------------------------
// sendCandidateEmail
// ---------------------------------------------------------------------------

export type SendEmailResult =
  | { success: true; sentEmailId: string }
  | { success: false; error: string }

/**
 * Sends an email to a candidate using a stored template (or explicit overrides).
 *
 * - Refuses if candidate has no email address.
 * - Refuses if SMTP is not configured for the tenant.
 * - Inserts a sent_emails row regardless of success or failure.
 * - Audit-logs candidate.email_sent with status metadata.
 */
export async function sendCandidateEmail(input: {
  candidateId: string
  templateId?: string
  overrideSubject?: string
  overrideBody?: string
}): Promise<SendEmailResult> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userId: actorId, userRole } = ctx

  try {
    requireRole(userRole ?? undefined, 'recruiter')
  } catch {
    return { success: false, error: 'Forbidden: recruiters and admins only' }
  }

  // ── Fetch candidate ──────────────────────────────────────────────────────
  const [candidate] = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        id: candidates.id,
        firstName: candidates.firstName,
        lastName: candidates.lastName,
        email: candidates.email,
        tenantId: candidates.tenantId,
      })
      .from(candidates)
      .where(and(eq(candidates.id, input.candidateId), eq(candidates.tenantId, tenantId)))
      .limit(1)
  )
  if (!candidate) return { success: false, error: 'Candidate not found' }
  if (!candidate.email) return { success: false, error: 'No email on file' }

  // ── Resolve template ─────────────────────────────────────────────────────
  // If both overrides are provided, skip the DB template lookup entirely.
  const useOverrides = input.overrideSubject !== undefined && input.overrideBody !== undefined

  let templateName = 'Custom'
  let rawSubject = input.overrideSubject ?? ''
  let rawBody = input.overrideBody ?? ''
  let resolvedTemplateId: string | undefined = input.templateId

  if (!useOverrides) {
    if (!input.templateId) {
      return { success: false, error: 'templateId is required when overrides are not provided' }
    }
    const [tpl] = await withTenant(tenantId, async (tx) =>
      tx
        .select({
          id: emailTemplates.id,
          name: emailTemplates.name,
          subject: emailTemplates.subject,
          body: emailTemplates.body,
        })
        .from(emailTemplates)
        .where(
          and(eq(emailTemplates.id, input.templateId!), eq(emailTemplates.tenantId, tenantId))
        )
        .limit(1)
    )
    if (!tpl) return { success: false, error: 'Template not found' }
    templateName = tpl.name
    rawSubject = tpl.subject
    rawBody = tpl.body
    resolvedTemplateId = tpl.id
  }

  // ── Fetch most-recent scored role for variable context ───────────────────
  let roleTitle = ''
  let customerName = ''

  const recentScoreRows = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        roleTitle: roles.title,
        customerId: roles.customerId,
      })
      .from(scores)
      .innerJoin(roles, eq(scores.roleId, roles.id))
      .where(and(eq(scores.candidateId, input.candidateId), eq(scores.tenantId, tenantId)))
      .orderBy(desc(scores.createdAt))
      .limit(1)
  )

  if (recentScoreRows.length > 0) {
    roleTitle = recentScoreRows[0].roleTitle
    const customerId = recentScoreRows[0].customerId
    if (customerId) {
      const [cust] = await withTenant(tenantId, async (tx) =>
        tx
          .select({ name: customers.name })
          .from(customers)
          .where(eq(customers.id, customerId))
          .limit(1)
      )
      if (cust) customerName = cust.name
    }
  }

  // ── Fetch recruiter display name ─────────────────────────────────────────
  let recruiterName = 'The Recruitment Team'
  if (actorId) {
    const [recruiter] = await withTenant(tenantId, async (tx) =>
      tx
        .select({ name: users.name })
        .from(users)
        .where(and(eq(users.id, actorId), eq(users.tenantId, tenantId)))
        .limit(1)
    )
    if (recruiter) recruiterName = recruiter.name
  }

  // ── Fetch tenant name ────────────────────────────────────────────────────
  let tenantName = ''
  const [tenantRow] = await withTenant(tenantId, async (tx) =>
    tx
      .select({ name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1)
  )
  if (tenantRow) tenantName = tenantRow.name

  // ── Substitute template variables ────────────────────────────────────────
  const vars: Record<string, string> = {
    'candidate.firstName': candidate.firstName,
    'candidate.lastName': candidate.lastName,
    'candidate.email': candidate.email,
    'role.title': roleTitle,
    'role.customerName': customerName,
    'recruiter.name': recruiterName,
    'tenant.name': tenantName,
    'tenant.followUpWindow': '5',
  }

  const finalSubject = substituteTemplate(rawSubject, vars)
  const finalBody = substituteTemplate(rawBody, vars)
  const finalBodyText = finalBody.replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim()

  // ── Resolve SMTP sender ──────────────────────────────────────────────────
  const sender = await getSenderForTenant(tenantId)
  if (!sender) {
    return { success: false, error: 'SMTP not configured' }
  }

  // ── Read smtp_from_* for the sent_emails log row ─────────────────────────
  const smtpRows = await withTenant(tenantId, async (tx) =>
    tx
      .select({ key: tenantSettings.key, value: tenantSettings.value })
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, tenantId))
  )
  const smtpMap: Record<string, string> = {}
  for (const r of smtpRows) smtpMap[r.key] = r.value

  const senderEmail = smtpMap['smtp_from_email'] ?? ''
  const senderName = smtpMap['smtp_from_name'] ?? senderEmail

  // ── Send ─────────────────────────────────────────────────────────────────
  const sendResult = await sender.send({
    to: candidate.email,
    toName: `${candidate.firstName} ${candidate.lastName}`,
    from: senderEmail,
    fromName: senderName,
    subject: finalSubject,
    bodyHtml: finalBody,
    bodyText: finalBodyText,
  })

  // ── Persist sent_emails row (always, regardless of success/failure) ───────
  const [inserted] = await withTenant(tenantId, async (tx) =>
    tx
      .insert(sentEmails)
      .values({
        tenantId,
        candidateId: input.candidateId,
        templateId: resolvedTemplateId ?? undefined,
        templateName,
        recipientEmail: candidate.email!,
        recipientName: `${candidate.firstName} ${candidate.lastName}`,
        senderUserId: actorId || undefined,
        senderEmail,
        senderName,
        subject: finalSubject,
        body: finalBody,
        sendStatus: sendResult.ok ? 'sent' : 'failed',
        errorMessage: sendResult.ok ? undefined : sendResult.error,
      })
      .returning({ id: sentEmails.id })
  )

  // ── Audit log ────────────────────────────────────────────────────────────
  await writeAuditLog(tenantId, {
    action: 'candidate.email_sent',
    entityType: 'candidate',
    entityId: input.candidateId,
    entityLabel: `${candidate.firstName} ${candidate.lastName}`,
    metadata: {
      templateName,
      recipient: candidate.email,
      status: sendResult.ok ? 'sent' : 'failed',
      sentEmailId: inserted.id,
    },
  })

  if (!sendResult.ok) {
    return { success: false, error: sendResult.error }
  }

  return { success: true, sentEmailId: inserted.id }
}

// ---------------------------------------------------------------------------
// listSentEmailsForCandidate
// ---------------------------------------------------------------------------

/**
 * Returns all sent_emails rows for a candidate, newest first.
 * Accessible to recruiters and above.
 */
export async function listSentEmailsForCandidate(candidateId: string): Promise<SentEmail[]> {
  const ctx = await getActionContext()
  if (!ctx) return []
  const { tenantId, userRole } = ctx

  try {
    requireRole(userRole ?? undefined, 'recruiter')
  } catch {
    return []
  }

  return withTenant(tenantId, async (tx) =>
    tx
      .select()
      .from(sentEmails)
      .where(and(eq(sentEmails.candidateId, candidateId), eq(sentEmails.tenantId, tenantId)))
      .orderBy(desc(sentEmails.sentAt))
  )
}

// ---------------------------------------------------------------------------
// seedTemplatesForCurrentTenant
// ---------------------------------------------------------------------------

/**
 * Admin-only convenience action: seeds the 5 default email templates for the
 * current tenant if they don't already exist.
 */
export async function seedTemplatesForCurrentTenant(): Promise<
  { success: true } | { success: false; error: string }
> {
  const ctx = await getActionContext()
  if (!ctx) return { success: false, error: 'Unauthorized' }
  const { tenantId, userRole } = ctx

  try {
    requireRole(userRole ?? undefined, 'admin')
  } catch {
    return { success: false, error: 'Forbidden: admins only' }
  }

  await seedDefaultTemplates(tenantId)
  return { success: true }
}
