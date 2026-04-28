import { withTenant } from '@/db'
import { emailTemplates } from '@/db/schema'
import { eq, and } from 'drizzle-orm'

interface DefaultTemplate {
  name: string
  category: string
  subject: string
  body: string
}

const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    name: 'Screening Invite',
    category: 'screening_invite',
    subject: 'Screening invite — {{role.title}}',
    body: `<p>Hi {{candidate.firstName}},</p>

<p>Thank you for your interest in the <strong>{{role.title}}</strong> position{{role.customerName ? ' with ' + role.customerName : ''}}. We have reviewed your profile and would love to learn more about you.</p>

<p>We would like to invite you to a brief 30-minute screening call at a time that suits you. During this call we will walk through the role requirements, discuss your background and experience, and answer any questions you may have.</p>

<p>Please reply to this email with your availability over the next few days and we will confirm a time that works for everyone.</p>

<p>We look forward to speaking with you soon.</p>

<p>Warm regards,<br>
{{recruiter.name}}<br>
{{tenant.name}}</p>`,
  },
  {
    name: 'Scoring Decline',
    category: 'scoring_decline',
    subject: 'Re: {{role.title}} application',
    body: `<p>Hi {{candidate.firstName}},</p>

<p>Thank you for taking the time to submit your application for the <strong>{{role.title}}</strong> role. We genuinely appreciate your interest and the effort you put into your application.</p>

<p>After an initial review of all applications received, we have decided not to progress your candidacy for this particular position at this time. This decision was not easy given the quality of applicants we received, and it does not reflect on your overall capabilities or experience.</p>

<p>We will keep your CV on file in our candidate archive and will be in touch if a suitable opportunity arises in the future.</p>

<p>We wish you every success in your job search.</p>

<p>Kind regards,<br>
{{recruiter.name}}<br>
{{tenant.name}}</p>`,
  },
  {
    name: 'Post Interview Follow-up',
    category: 'post_interview',
    subject: 'Thanks for chatting today — {{role.title}}',
    body: `<p>Hi {{candidate.firstName}},</p>

<p>Thank you so much for taking the time to speak with us today about the <strong>{{role.title}}</strong> opportunity. It was a pleasure getting to know you better and learning more about your experience and background.</p>

<p>We found our conversation very informative and will now be discussing next steps with the wider team. We aim to come back to you within <strong>{{tenant.followUpWindow}} business days</strong> with an update.</p>

<p>In the meantime, please do not hesitate to reach out if you have any questions. We will be in touch very soon.</p>

<p>Best regards,<br>
{{recruiter.name}}<br>
{{tenant.name}}</p>`,
  },
  {
    name: 'Rejection After Interview',
    category: 'rejection',
    subject: 'Update on the {{role.title}} role',
    body: `<p>Hi {{candidate.firstName}},</p>

<p>Thank you again for the time and effort you invested in the interview process for the <strong>{{role.title}}</strong> position. We genuinely appreciated the opportunity to meet you and learn about your experience.</p>

<p>After careful consideration and discussions with the wider team, we have decided to move forward with another candidate whose profile was a closer match to the specific requirements of this role at this time. This was a difficult decision and in no way reflects negatively on your skills or potential.</p>

<p>We will retain your CV in our candidate archive and would be happy to consider you for future opportunities that may be a better fit.</p>

<p>We wish you every success in your career and hope our paths may cross again in the future.</p>

<p>Kind regards,<br>
{{recruiter.name}}<br>
{{tenant.name}}</p>`,
  },
  {
    name: 'Offer Pending',
    category: 'offer_pending',
    subject: 'Next steps for {{role.title}}',
    body: `<p>Hi {{candidate.firstName}},</p>

<p>I am delighted to let you know that following your interview for the <strong>{{role.title}}</strong> role, we would like to move forward with you as our preferred candidate.</p>

<p>We are currently finalising the details of a formal offer and anticipate being in touch within the next couple of business days with the full offer documentation for your review.</p>

<p>In the meantime, please let us know if you have any immediate questions or if there is anything you need from us to help you make your decision.</p>

<p>We are very much looking forward to the possibility of you joining the team and will be back in touch shortly.</p>

<p>Warm regards,<br>
{{recruiter.name}}<br>
{{tenant.name}}</p>`,
  },
]

/**
 * seedDefaultTemplates — inserts the 5 system default email templates for
 * the given tenant if they do not already exist (idempotent by template name).
 *
 * Called at tenant provisioning time or via the admin convenience action.
 */
export async function seedDefaultTemplates(tenantId: string): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    for (const tpl of DEFAULT_TEMPLATES) {
      // Check if a template with this name already exists for the tenant
      const existing = await tx
        .select({ id: emailTemplates.id })
        .from(emailTemplates)
        .where(
          and(
            eq(emailTemplates.tenantId, tenantId),
            eq(emailTemplates.name, tpl.name)
          )
        )
        .limit(1)

      if (existing.length > 0) continue

      await tx.insert(emailTemplates).values({
        tenantId,
        name: tpl.name,
        category: tpl.category,
        subject: tpl.subject,
        body: tpl.body,
        isDefault: true,
      })
    }
  })
}
