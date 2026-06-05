# Tool catalogue

_Every tool the SkillAI MCP server exposes — auto-generated from the live tool registry on 2026-05-29._

> **ℹ️ Note** — This page is generated from `docs-site/src/data/mcp-catalogue.json` by `scripts/sync-techdocs.mjs`. Do not edit it by hand; re-run `npm run techdocs:sync`.

## Summary

| Metric | Count |
|---|---|
| Tools total | 48 |
| Read tools | 27 |
| Write tools | 21 |
| Modules | 12 |
| Resources | 4 |
| Prompts | 3 |

## candidates (9)

| Tool | Scope | Description |
|---|---|---|
| `list_candidates` | read | List candidates in the active tenant. Optional filters: substring search on name, agencyId, pipeline status, availability status. Returns id, name, email, agency, status, and (if scored) overallScore. Pagination via limit (max 200) and offset. |
| `get_candidate` | read | Fetch a single candidate by id with their CV text, agency, contact details, rates, and availability. Returns null if the candidate does not exist or belongs to another tenant. |
| `find_candidate_by_email` | read | Look up a candidate by their email address (case-insensitive). Returns the candidate record or null. Useful when an external system references a person by email. |
| `update_candidate_status` | write | Move a candidate to a new pipeline stage (new / shortlisted / interviewing / offered / hired / rejected / rejected_by_customer). Requires write scope and confirmed: true. |
| `update_candidate_availability` | write | Set a candidate's availability flag (available / on_project / unavailable) and an optional availableFrom date. Requires write scope and confirmed: true. |
| `find_candidate_by_name` | read | Case-insensitive substring match against `firstName + " " + lastName`. Returns up to 20 matches with their agency. Useful when the LLM has only a free-text name. |
| `semantic_search_candidates` | read | Vector-similarity search for candidates against a role's description using pgvector cosine distance. Provide `roleId` (the action embeds the role text). Already-scored candidates on the role are excluded. NOTE v1: free-text `query` is accepted by the schema but returns a clear error — the underlying matching action only supports roleId-based search at present. |
| `create_candidate` | write | Create a new candidate by uploading a CV (base64-encoded). The CV is validated, parsed, stored, and a pending score row is queued against the supplied roleId. Embedding generation runs in the background. Max 10MB per file. Requires write scope and confirmed: true. |
| `archive_candidate` | write | Soft-archive a candidate (sets isActive = false). The candidate remains queryable for audit/history. Requires write scope and confirmed: true. |

## roles (6)

| Tool | Scope | Description |
|---|---|---|
| `list_roles` | read | List job roles in the active tenant with their customer, location, deadlines, and budget. By default hides archived roles (set activeOnly=false to include them). |
| `get_role` | read | Fetch a single role by id with description, requirements, key skills, top requirements, language requirements, and budget. Returns null if not found. |
| `get_role_with_candidates` | read | Fetch a role and the candidates scored against it, sorted by overallScore descending. Includes per-dimension scores. Optional minScore filter. |
| `update_role` | write | Edit an existing role. The server action does a full replace of the editable fields — title/description/requirements are always required. Optional fields default to null/empty when omitted. Tag regeneration runs after the response. Requires write scope and confirmed: true. |
| `regenerate_role_tags` | write | Re-run AI tag extraction (key skills + top requirements) for a role using its current description and requirements. Runs in the background after the response. Requires write scope and confirmed: true. |
| `archive_role` | write | Soft-archive a role (isActive=false). Requires write scope and confirmed: true. |

## agencies (2)

| Tool | Scope | Description |
|---|---|---|
| `list_agencies` | read | List recruitment agencies in the active tenant. The internal-employee bench is exposed as the system "Internal" agency (isInternal=true). Hides archived rows by default. |
| `get_agency` | read | Fetch a single agency by id with its contact details and notes. |

## customers (2)

| Tool | Scope | Description |
|---|---|---|
| `list_customers` | read | List customer entities (the companies we hire for). Archived rows hidden by default. |
| `get_customer` | read | Fetch a single customer by id with portal URL, contact details, and active status. |

## scoring (2)

| Tool | Scope | Description |
|---|---|---|
| `get_candidate_score` | read | Fetch the score row for a candidate against a specific role, including all four dimension scores (technical, experience, cultural fit, communication), AI reasoning per dimension, and the AI summary. Returns null if no scoring run exists yet. |
| `rescore_candidate` | write | Re-run AI scoring for a candidate against a role. The score is reset to pending and the AI pipeline runs in the background. Poll get_candidate_score for results. Requires write scope and confirmed: true. |

## interviews (3)

| Tool | Scope | Description |
|---|---|---|
| `list_interview_packs` | read | List interview packs in the active tenant. Filter by candidateId and/or roleId. Includes generation status (pending/processing/complete/failed), packType, language, and recommended duration. |
| `generate_interview_pack` | write | Queue an interview pack generation job for a candidate × role pair. The pack is created with status="pending" — actual AI generation runs in the background; the LLM should poll get_interview_pack to fetch the questions once status="complete". Pre-screening packs are short, full_technical packs are longer and may include a code challenge. Recruiter/admin only. Requires write scope and confirmed: true. |
| `get_interview_pack` | read | Fetch a full interview pack (the pack record plus all generated questions). Returns { pack: null, questions: [] } if the pack id is not found in the active tenant. |

## approvals (5)

| Tool | Scope | Description |
|---|---|---|
| `get_approvals_for_role` | read | Fetch the approval state for every shortlisted candidate × assigned manager combination on a role. Returns approval status (pending/approved/rejected), decided-at timestamps, and comments. Used by recruiters to track shortlist progress. |
| `approve_candidate` | write | Record a manager approval for a candidate on a role. Only assigned managers (or admins) may decide. Optional comment. Requires write scope and confirmed: true. |
| `send_shortlist_for_approval` | write | Mark a role's shortlist as sent to its assigned hiring managers and seed pending approval rows for every (shortlisted candidate × manager) pair. Idempotent — re-sending does not reset existing decisions. Recruiter/admin only. Requires write scope and confirmed: true. |
| `approve_all_remaining` | write | Bulk-approve every still-pending approval row owned by the calling manager on the role. Manager scope (the calling user must be assigned as a manager on the role). Optional comment is applied to every row. Requires write scope and confirmed: true. |
| `reject_candidate` | write | Record a manager rejection for a candidate on a role. Only assigned managers (or admins) may decide. Optional comment. Requires write scope and confirmed: true. |

## managers (4)

| Tool | Scope | Description |
|---|---|---|
| `get_my_assigned_roles` | read | For the calling hiring manager, list every role that has been assigned to them with pending and decided counts. Returns an empty list if the caller is not a manager. |
| `get_role_managers` | read | List the hiring managers currently assigned to a role, with email, name, primary flag, and added-at timestamp. Returns [] if no managers are assigned (or role does not exist). |
| `assign_role_managers` | write | Replace the full set of hiring managers for a role with the supplied userIds. Non-hiring_manager users are silently dropped. If primaryUserId is supplied AND is in the valid set it is flagged as primary. Recruiter/admin only. Requires write scope and confirmed: true. |
| `remove_role_manager` | write | Detach a single hiring manager from a role. Recruiter/admin only. Requires write scope and confirmed: true. |

## notes (3)

| Tool | Scope | Description |
|---|---|---|
| `create_note` | write | Add a timestamped note to a candidate. Body is plain text up to 5000 chars. The note is attributed to the calling user. Requires write scope and confirmed: true. |
| `update_note` | write | Edit the body of an existing note. Only the original author or an admin may edit. Sets isEdited=true. Requires write scope and confirmed: true. |
| `delete_note` | write | Permanently delete a note. Only the original author or an admin may delete. Requires write scope and confirmed: true. |

## users (4)

| Tool | Scope | Description |
|---|---|---|
| `list_users` | admin | List all users in the active tenant. Admin scope required. |
| `update_user_role` | admin | Change a user's product-role (admin / recruiter / hiring_manager / viewer). You cannot change your own role. Admin scope required, confirmed: true required. |
| `invite_user` | admin | Create a single-use invitation for a new user in the active tenant. Returns the invitation id, raw token, and a fully-qualified invite URL the admin can share. The role can be any of admin/recruiter/hiring_manager/viewer. Note: createInvitation server action reads its tenant from HTTP headers, so we mirror its (small) logic here against withTenant — same pattern used by update_user_role and deactivate_user. Admin scope and confirmed: true required. |
| `deactivate_user` | admin | Soft-deactivate a user (sets isActive=false). You cannot deactivate yourself. Admin scope and confirmed: true required. |

## settings (1)

| Tool | Scope | Description |
|---|---|---|
| `list_configured_keys` | admin | List which AI provider keys (anthropic / google / openai) are configured for the active tenant. Returns just the key NAMES, never the secret values. Admin scope required. |

## exports (7)

| Tool | Scope | Description |
|---|---|---|
| `export_candidate_cv_pdf` | read | Return the candidate's stored CV file as a base64 attachment. The file is whatever format was uploaded (PDF/DOCX/ODT/RTF/TXT/MD) — not necessarily PDF. Returns null attachment if the candidate has no stored file. |
| `export_candidate_internal_pdf` | read | Render the full internal candidate profile PDF — includes scores, agency, rates, recruiter notes, transcript red flags, and recommended decision. If roleId is supplied the PDF's "active role" section uses that role's score; otherwise the most recent complete score is used. |
| `export_candidate_customer_pdf` | read | Render the customer-facing candidate profile PDF — strips recruiter notes, candidate rate, margin, red flags, recommended decision, and blanks low-confidence transcript reasoning. Safe to forward outside the company. |
| `export_role_brief_pdf` | read | Render a one-role-brief PDF with title, customer, location, work mode, language requirements, key skills, top requirements, budget, and the full description + requirements. |
| `export_shortlist_pdf` | read | Render the ranked shortlist for a role as a single PDF. audience="recruiter" includes agency + margin per candidate; audience="customer" suppresses the margin column. |
| `export_interview_pack_pdf` | read | Render a fully-generated interview pack (questions + optional code challenge) as a PDF. Returns null attachment if the pack does not exist or has not finished generating (generationStatus must be "complete"). |
| `compose_candidate_email_attachments` | read | Killer-workflow tool. Returns everything an LLM needs to draft an email about a candidate-on-a-role in a single call: { candidate, role, attachments: { cv, interviewPack?, scoreSummary } }. Sub-fetches: (1) the raw CV file from disk, (2) the most recent interview pack for this candidate × role pair (omitted if none exists or the latest is not yet complete), (3) the structured score record (overall, dimensions, reasoning, summary). Read-only; no confirm. |

## Resources

| URI | Name | Description |
|---|---|---|
| `skillai://candidates/{id}` | candidate | A single candidate record with their agency name and contact details. |
| `skillai://roles/{id}` | role | A role record together with all candidates scored against it, sorted by overallScore. |
| `skillai://interview-packs/{id}` | interview-pack | An interview pack with all generated questions. |
| `skillai://my-shortlists` | my-shortlists | For the calling user, the roles where you have approvals to make. |

## Prompts

| Name | Description |
|---|---|
| `prepare-interview-brief` | Assemble everything an interviewer needs to walk into a conversation with a specific candidate against a specific role: CV summary, dimension scores with reasoning, the generated interview pack, and any prior notes or transcript analyses. |
| `weekly-shortlist-review` | For a hiring manager, summarise the current state of approvals on a role and surface the top candidates still awaiting a decision. |
| `email-candidate-introduction` | Draft an introduction email to a third party (typically a hiring manager) about a specific candidate against a specific role. Pulls the CV summary and score so the narrative is grounded in actual SkillAi data. |
