import { eq } from 'drizzle-orm'
import { withTenant } from '@/db'
import { roleSubmissions, users, candidates, roles, tenants } from '@/db/schema'
import { getSenderForTenant } from './sender'

type Args = {
  tenantId: string
  submissionId: string
  candidateId: string
  roleId: string
  fromStatus: string
  toStatus: string
  customerName?: string | null
  customerEmail?: string | null
}

const STATUS_LABELS: Record<string, string> = {
  submitted: 'Submitted',
  interview_scheduled: 'Interview scheduled',
  interview_done: 'Interview done',
  feedback_pending: 'Feedback pending',
  hired: 'Hired',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
}

function label(status: string): string {
  return STATUS_LABELS[status] ?? status
}

/**
 * Sends an email to the recruiter who originally submitted this candidate
 * when the customer updates the status via a share link.
 *
 * Designed to be called fire-and-forget (`.catch(...)`) from the public
 * `updateSubmissionStatusByToken` action — must NEVER throw and never
 * block the customer's status update. All failure paths return silently.
 *
 * Skips cleanly when:
 *   - status didn't actually change
 *   - no recruiter assigned (sentByUserId is null on the submission row)
 *   - recruiter has no email on file
 *   - SMTP isn't configured for the tenant
 *   - any DB / SMTP error along the way
 */
export async function notifyRecruiterOfCustomerUpdate(args: Args): Promise<void> {
  // No-op when the customer "updated" without changing the status (rare but possible)
  if (args.fromStatus === args.toStatus) return

  try {
    const sender = await getSenderForTenant(args.tenantId)
    if (!sender) return // SMTP not configured for this tenant — skip silently

    const [row] = await withTenant(args.tenantId, async (tx) =>
      tx
        .select({
          recruiterEmail: users.email,
          recruiterName: users.name,
          candidateFirstName: candidates.firstName,
          candidateLastName: candidates.lastName,
          roleTitle: roles.title,
          tenantName: tenants.name,
        })
        .from(roleSubmissions)
        .innerJoin(candidates, eq(roleSubmissions.candidateId, candidates.id))
        .innerJoin(roles, eq(roleSubmissions.roleId, roles.id))
        .innerJoin(tenants, eq(roleSubmissions.tenantId, tenants.id))
        .leftJoin(users, eq(roleSubmissions.sentByUserId, users.id))
        .where(eq(roleSubmissions.id, args.submissionId))
        .limit(1)
    )

    if (!row?.recruiterEmail) return // recruiter no longer exists or has no email

    const candidateName = `${row.candidateFirstName} ${row.candidateLastName}`.trim()
    const fromLabel = label(args.fromStatus)
    const toLabel = label(args.toStatus)
    const customerLine = args.customerName || args.customerEmail
      ? `Submitted by: ${[args.customerName, args.customerEmail].filter(Boolean).join(' — ')}`
      : null

    const subject = `[${row.tenantName}] ${candidateName} → ${row.roleTitle}: ${toLabel}`

    const bodyText = [
      `The customer has updated the status of a candidate you submitted.`,
      ``,
      `Candidate: ${candidateName}`,
      `Role: ${row.roleTitle}`,
      `Status: ${fromLabel} → ${toLabel}`,
      customerLine,
      ``,
      `Open the role to review or change the status:`,
      `${process.env.APP_URL ?? ''}/dashboard/roles/${args.roleId}`,
    ].filter(Boolean).join('\n')

    const bodyHtml = `<!doctype html><html><body style="font-family: system-ui, sans-serif; color: #18181b; max-width: 560px;">
<p>The customer has updated the status of a candidate you submitted.</p>
<table cellpadding="6" style="border-collapse: collapse; font-size: 14px;">
  <tr><td style="color: #71717a;">Candidate</td><td>${escapeHtml(candidateName)}</td></tr>
  <tr><td style="color: #71717a;">Role</td><td>${escapeHtml(row.roleTitle)}</td></tr>
  <tr><td style="color: #71717a;">Status</td><td><strong>${escapeHtml(fromLabel)} → ${escapeHtml(toLabel)}</strong></td></tr>
  ${customerLine ? `<tr><td style="color: #71717a;">Submitted by</td><td>${escapeHtml(customerLine.replace(/^Submitted by: /, ''))}</td></tr>` : ''}
</table>
<p style="margin-top: 16px;">
  <a href="${process.env.APP_URL ?? ''}/dashboard/roles/${args.roleId}"
     style="display: inline-block; background: #2563eb; color: white; padding: 8px 14px; border-radius: 6px; text-decoration: none;">
    Open role
  </a>
</p>
</body></html>`

    await sender.send({
      to: row.recruiterEmail,
      toName: row.recruiterName ?? undefined,
      from: '',  // sender ignores `from` in favour of its config — see SmtpSender.send
      fromName: '',
      subject,
      bodyHtml,
      bodyText,
    })
  } catch (err) {
    console.warn('[notify-recruiter-customer-update] failed:', err)
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
