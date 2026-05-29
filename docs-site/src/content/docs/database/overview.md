---
title: Schema overview
description: Logical grouping of the 29 tables in the SkillAI database.
---

import { Aside } from '@astrojs/starlight/components'

<Aside type="tip">
**28 tables**, all multi-tenant via PostgreSQL Row-Level Security. Every tenant-scoped table includes `tenant_id UUID NOT NULL` and is filtered by an RLS policy that reads `app.tenant_id` from the session. See [DEC-003](/SkillAi/decisions/dec-003-row-level-security) for the rationale.
</Aside>

## Identity & tenancy

| Table | Columns | Source |
|---|---|---|
| [`tenants`](/SkillAi/database/tables/tenants) | 5 | `src/db/schema/tenants.ts` |
| [`users`](/SkillAi/database/tables/users) | 12 | `src/db/schema/users.ts` |
| [`user_invitations`](/SkillAi/database/tables/user-invitations) | 9 | `src/db/schema/user-invitations.ts` |
| [`tenant_settings`](/SkillAi/database/tables/tenant-settings) | 6 | `src/db/schema/tenant-settings.ts` |
| [`api_tokens`](/SkillAi/database/tables/api-tokens) | 11 | `src/db/schema/api-tokens.ts` |

## Roles & candidates

| Table | Columns | Source |
|---|---|---|
| [`roles`](/SkillAi/database/tables/roles) | 27 | `src/db/schema/roles.ts` |
| [`candidates`](/SkillAi/database/tables/candidates) | 41 | `src/db/schema/candidates.ts` |
| [`cv_profiles`](/SkillAi/database/tables/cv-profiles) | 13 | `src/db/schema/cv-profiles.ts` |
| [`candidate_enrichments`](/SkillAi/database/tables/candidate-enrichments) | 11 | `src/db/schema/candidate-enrichments.ts` |
| [`role_managers`](/SkillAi/database/tables/role-managers) | 7 | `src/db/schema/role-managers.ts` |
| [`role_submissions`](/SkillAi/database/tables/role-submissions) | 13 | `src/db/schema/role-submissions.ts` |

## Scoring & matching

| Table | Columns | Source |
|---|---|---|
| [`scores`](/SkillAi/database/tables/scores) | 18 | `src/db/schema/scores.ts` |
| [`ai_usage`](/SkillAi/database/tables/ai-usage) | 13 | `src/db/schema/ai-usage.ts` |

## Interviews & approvals

| Table | Columns | Source |
|---|---|---|
| [`interview_slots`](/SkillAi/database/tables/interview-slots) | 17 | `src/db/schema/interview-slots.ts` |
| [`interview_packs`](/SkillAi/database/tables/interview-packs) | 15 | `src/db/schema/interview-packs.ts` |
| [`interview_questions`](/SkillAi/database/tables/interview-questions) | 13 | `src/db/schema/interview-questions.ts` |
| [`code_challenges`](/SkillAi/database/tables/code-challenges) | 9 | `src/db/schema/code-challenges.ts` |
| [`interview_transcripts`](/SkillAi/database/tables/interview-transcripts) | 14 | `src/db/schema/interview-transcripts.ts` |
| [`transcript_analyses`](/SkillAi/database/tables/transcript-analyses) | 19 | `src/db/schema/transcript-analyses.ts` |
| [`candidate_role_approvals`](/SkillAi/database/tables/candidate-role-approvals) | 9 | `src/db/schema/candidate-role-approvals.ts` |

## Agencies, customers, notes

| Table | Columns | Source |
|---|---|---|
| [`agencies`](/SkillAi/database/tables/agencies) | 11 | `src/db/schema/agencies.ts` |
| [`customers`](/SkillAi/database/tables/customers) | 13 | `src/db/schema/customers.ts` |
| [`customer_frameworks`](/SkillAi/database/tables/customer-frameworks) | 9 | `src/db/schema/customer-frameworks.ts` |
| [`notes`](/SkillAi/database/tables/notes) | 9 | `src/db/schema/notes.ts` |
| [`sent_emails`](/SkillAi/database/tables/sent-emails) | 15 | `src/db/schema/sent-emails.ts` |
| [`email_templates`](/SkillAi/database/tables/email-templates) | 9 | `src/db/schema/email-templates.ts` |

## Calendars & audit

| Table | Columns | Source |
|---|---|---|
| [`calendar_connections`](/SkillAi/database/tables/calendar-connections) | 9 | `src/db/schema/calendar-connections.ts` |
| [`audit_logs`](/SkillAi/database/tables/audit-logs) | 10 | `src/db/schema/audit-logs.ts` |
