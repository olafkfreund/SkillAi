import { sql } from 'drizzle-orm'
import { withTenant } from '@/db'

/**
 * Returns true if this candidate has been rejected by the given customer on
 * any prior role (active or archived). Two signals count:
 *
 *   1. role_submissions.status = 'rejected' on a role tied to this customer
 *   2. candidate_role_approvals.decision = 'rejected' on a role tied to this customer
 *
 * Both signals are joined through roles.customer_id so the rejection must
 * have been against THIS customer specifically. Rejections on other customers'
 * roles do not count.
 */
export async function hasBeenRejectedByCustomer(
  candidateId: string,
  customerId: string,
  tenantId: string,
): Promise<boolean> {
  return withTenant(tenantId, async (tx) => {
    const submissionRows = await tx.execute(sql`
      SELECT 1
      FROM role_submissions rs
      INNER JOIN roles r ON r.id = rs.role_id
      WHERE rs.candidate_id = ${candidateId}::uuid
        AND r.customer_id = ${customerId}::uuid
        AND rs.status = 'rejected'
      LIMIT 1
    `)
    if (Array.from(submissionRows).length > 0) return true

    const approvalRows = await tx.execute(sql`
      SELECT 1
      FROM candidate_role_approvals cra
      INNER JOIN roles r ON r.id = cra.role_id
      WHERE cra.candidate_id = ${candidateId}::uuid
        AND r.customer_id = ${customerId}::uuid
        AND cra.decision = 'rejected'
      LIMIT 1
    `)
    return Array.from(approvalRows).length > 0
  })
}
