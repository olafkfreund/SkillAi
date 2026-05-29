---
title: Schema overview
description: Logical grouping of the 29 tables in the SkillAI database.
---

import { Aside } from '@astrojs/starlight/components'

<Aside type="tip">
**28 tables**, all multi-tenant via PostgreSQL Row-Level Security. Every tenant-scoped table includes `tenant_id UUID NOT NULL` and is filtered by an RLS policy that reads `app.tenant_id` from the session. See [DEC-003](/decisions/dec-003-row-level-security) for the rationale.
</Aside>

## Identity & tenancy

| Table | Columns | Source |
|---|---|---|
| [`tenants`](/database/tables/tenants) | 5 | `src/db/schema/tenants.ts` |
| [`users`](/database/tables/users) | 12 | `src/db/schema/users.ts` |
| [`user_invitations`](/database/tables/user-invitations) | 9 | `src/db/schema/user-invitations.ts` |
| [`tenant_settings`](/database/tables/tenant-settings) | 6 | `src/db/schema/tenant-settings.ts` |
| [`api_tokens`](/database/tables/api-tokens) | 11 | `src/db/schema/api-tokens.ts` |

## Roles & candidates

| Table | Columns | Source |
|---|---|---|
| [`roles`](/database/tables/roles) | 27 | `src/db/schema/roles.ts` |
| [`candidates`](/database/tables/candidates) | 41 | `src/db/schema/candidates.ts` |
| [`cv_profiles`](/database/tables/cv-profiles) | 13 | `src/db/schema/cv-profiles.ts` |
| [`candidate_enrichments`](/database/tables/candidate-enrichments) | 11 | `src/db/schema/candidate-enrichments.ts` |
| [`role_managers`](/database/tables/role-managers) | 7 | `src/db/schema/role-managers.ts` |
| [`role_submissions`](/database/tables/role-submissions) | 13 | `src/db/schema/role-submissions.ts` |

## Scoring & matching

| Table | Columns | Source |
|---|---|---|
| [`scores`](/database/tables/scores) | 18 | `src/db/schema/scores.ts` |
| [`ai_usage`](/database/tables/ai-usage) | 13 | `src/db/schema/ai-usage.ts` |

## Interviews & approvals

| Table | Columns | Source |
|---|---|---|
| [`interview_slots`](/database/tables/interview-slots) | 17 | `src/db/schema/interview-slots.ts` |
| [`interview_packs`](/database/tables/interview-packs) | 15 | `src/db/schema/interview-packs.ts` |
| [`interview_questions`](/database/tables/interview-questions) | 13 | `src/db/schema/interview-questions.ts` |
| [`code_challenges`](/database/tables/code-challenges) | 9 | `src/db/schema/code-challenges.ts` |
| [`interview_transcripts`](/database/tables/interview-transcripts) | 14 | `src/db/schema/interview-transcripts.ts` |
| [`transcript_analyses`](/database/tables/transcript-analyses) | 19 | `src/db/schema/transcript-analyses.ts` |
| [`candidate_role_approvals`](/database/tables/candidate-role-approvals) | 9 | `src/db/schema/candidate-role-approvals.ts` |

## Agencies, customers, notes

| Table | Columns | Source |
|---|---|---|
| [`agencies`](/database/tables/agencies) | 11 | `src/db/schema/agencies.ts` |
| [`customers`](/database/tables/customers) | 13 | `src/db/schema/customers.ts` |
| [`customer_frameworks`](/database/tables/customer-frameworks) | 9 | `src/db/schema/customer-frameworks.ts` |
| [`notes`](/database/tables/notes) | 9 | `src/db/schema/notes.ts` |
| [`sent_emails`](/database/tables/sent-emails) | 15 | `src/db/schema/sent-emails.ts` |
| [`email_templates`](/database/tables/email-templates) | 9 | `src/db/schema/email-templates.ts` |

## Calendars & audit

| Table | Columns | Source |
|---|---|---|
| [`calendar_connections`](/database/tables/calendar-connections) | 9 | `src/db/schema/calendar-connections.ts` |
| [`audit_logs`](/database/tables/audit-logs) | 10 | `src/db/schema/audit-logs.ts` |
