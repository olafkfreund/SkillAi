# Schema overview

_Logical grouping of the 29 tables in the SkillAI database._

> **💡 Tip**
>
> **28 tables**, all multi-tenant via PostgreSQL Row-Level Security. Every tenant-scoped table includes `tenant_id UUID NOT NULL` and is filtered by an RLS policy that reads `app.tenant_id` from the session. See [DEC-003](../decisions/dec-003-row-level-security.md) for the rationale.

## Identity & tenancy

| Table | Columns | Source |
|---|---|---|
| [`tenants`](./tables/tenants.md) | 5 | `src/db/schema/tenants.ts` |
| [`users`](./tables/users.md) | 12 | `src/db/schema/users.ts` |
| [`user_invitations`](./tables/user-invitations.md) | 9 | `src/db/schema/user-invitations.ts` |
| [`tenant_settings`](./tables/tenant-settings.md) | 6 | `src/db/schema/tenant-settings.ts` |
| [`api_tokens`](./tables/api-tokens.md) | 11 | `src/db/schema/api-tokens.ts` |

## Roles & candidates

| Table | Columns | Source |
|---|---|---|
| [`roles`](./tables/roles.md) | 27 | `src/db/schema/roles.ts` |
| [`candidates`](./tables/candidates.md) | 41 | `src/db/schema/candidates.ts` |
| [`cv_profiles`](./tables/cv-profiles.md) | 13 | `src/db/schema/cv-profiles.ts` |
| [`candidate_enrichments`](./tables/candidate-enrichments.md) | 11 | `src/db/schema/candidate-enrichments.ts` |
| [`role_managers`](./tables/role-managers.md) | 7 | `src/db/schema/role-managers.ts` |
| [`role_submissions`](./tables/role-submissions.md) | 13 | `src/db/schema/role-submissions.ts` |

## Scoring & matching

| Table | Columns | Source |
|---|---|---|
| [`scores`](./tables/scores.md) | 18 | `src/db/schema/scores.ts` |
| [`ai_usage`](./tables/ai-usage.md) | 13 | `src/db/schema/ai-usage.ts` |

## Interviews & approvals

| Table | Columns | Source |
|---|---|---|
| [`interview_slots`](./tables/interview-slots.md) | 17 | `src/db/schema/interview-slots.ts` |
| [`interview_packs`](./tables/interview-packs.md) | 15 | `src/db/schema/interview-packs.ts` |
| [`interview_questions`](./tables/interview-questions.md) | 13 | `src/db/schema/interview-questions.ts` |
| [`code_challenges`](./tables/code-challenges.md) | 9 | `src/db/schema/code-challenges.ts` |
| [`interview_transcripts`](./tables/interview-transcripts.md) | 14 | `src/db/schema/interview-transcripts.ts` |
| [`transcript_analyses`](./tables/transcript-analyses.md) | 19 | `src/db/schema/transcript-analyses.ts` |
| [`candidate_role_approvals`](./tables/candidate-role-approvals.md) | 9 | `src/db/schema/candidate-role-approvals.ts` |

## Agencies, customers, notes

| Table | Columns | Source |
|---|---|---|
| [`agencies`](./tables/agencies.md) | 11 | `src/db/schema/agencies.ts` |
| [`customers`](./tables/customers.md) | 13 | `src/db/schema/customers.ts` |
| [`customer_frameworks`](./tables/customer-frameworks.md) | 9 | `src/db/schema/customer-frameworks.ts` |
| [`notes`](./tables/notes.md) | 9 | `src/db/schema/notes.ts` |
| [`sent_emails`](./tables/sent-emails.md) | 15 | `src/db/schema/sent-emails.ts` |
| [`email_templates`](./tables/email-templates.md) | 9 | `src/db/schema/email-templates.ts` |

## Calendars & audit

| Table | Columns | Source |
|---|---|---|
| [`calendar_connections`](./tables/calendar-connections.md) | 9 | `src/db/schema/calendar-connections.ts` |
| [`audit_logs`](./tables/audit-logs.md) | 10 | `src/db/schema/audit-logs.ts` |
