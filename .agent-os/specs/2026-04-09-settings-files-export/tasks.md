# Spec Tasks

These are the tasks to be completed for the spec detailed in @.agent-os/specs/2026-04-09-settings-files-export/spec.md

> Created: 2026-04-09
> Status: Ready for Implementation
> Depends on: core-mvp-foundation Tasks 1-3 (scaffold + DB schema + auth must exist)

## Tasks

- [ ] 1. Encryption utility + tenant_settings DB table
  - [ ] 1.1 Write unit tests for `encrypt()` / `decrypt()`: roundtrip produces original; different ciphertext each call; tampered tag throws
  - [ ] 1.2 Implement `src/lib/crypto.ts`: AES-256-GCM encrypt/decrypt using `NEXTAUTH_SECRET` as key source via `scryptSync`
  - [ ] 1.3 Add Drizzle schema `src/db/schema/tenant-settings.ts` with `tenantSettings` table, RLS policy, unique(tenantId, key) constraint
  - [ ] 1.4 Run `npm run db:generate` → verify migration contains `tenant_settings` table and RLS policy
  - [ ] 1.5 Implement `src/lib/ai/keys.ts`: `resolveAnthropicKey(tenantId)` and `resolveGoogleKey(tenantId)` — DB lookup → decrypt → fallback to env
  - [ ] 1.6 Write unit tests for `resolveAnthropicKey()`: DB key → decrypted; no DB key → env fallback; both missing → throws
  - [ ] 1.7 Update all Claude API calls (`src/lib/ai/claude.ts`, `src/lib/ai/interview.ts`) to use `resolveAnthropicKey()` instead of `process.env.ANTHROPIC_API_KEY` directly
  - [ ] 1.8 Verify all tests pass: `npm run test`

- [ ] 2. Settings panel UI + server actions
  - [ ] 2.1 Write integration test for `saveApiKey`: admin saves key → encrypted in DB; non-admin → permission error; short key → validation error
  - [ ] 2.2 Implement `saveApiKey(formData)` and `removeApiKey(provider)` server actions in `src/actions/settings.ts`
  - [ ] 2.3 Implement `GET /api/settings/integrations` route: check which keys configured, return masked values (last 4 chars)
  - [ ] 2.4 Write integration test for `GET /api/settings/integrations`: key saved → configured + masked; no key → not configured; non-admin → 403
  - [ ] 2.5 Build `<ApiKeyField />` component: masked display, edit/save/remove flow, loading states, error messages
  - [ ] 2.6 Write component test for `<ApiKeyField />`: unconfigured state; masked state; edit reveals input; save calls action
  - [ ] 2.7 Build settings page `src/app/(dashboard)/settings/page.tsx` with "Integrations" tab containing Claude and Gemini `<ApiKeyField />` components; admin-only guard in middleware
  - [ ] 2.8 Add "Settings" link to dashboard sidebar (admin only, shown conditionally by role)
  - [ ] 2.9 Verify all tests pass: `npm run test`

- [ ] 3. Extended CV file format support
  - [ ] 3.1 Install new parsers: `npm install node-odt rtf-parser`
  - [ ] 3.2 Add ODT, RTF, TXT fixture files to `tests/fixtures/` (small valid files)
  - [ ] 3.3 Write unit tests for `parseOdt()`, `parseRtf()`, `parseTxt()` using fixtures
  - [ ] 3.4 Implement `src/lib/parsers/odt.ts` using `node-odt`
  - [ ] 3.5 Implement `src/lib/parsers/rtf.ts` using `rtf-parser`
  - [ ] 3.6 Update `src/lib/parsers/index.ts` `parseFile()` dispatcher to handle `odt`, `rtf`, `txt`, `md`
  - [ ] 3.7 Write migration to extend `candidates.file_type` CHECK constraint to include `odt`, `rtf`, `txt`, `md`; run `npm run db:generate`
  - [ ] 3.8 Update `<CvDropzone />` accept map to include ODT, RTF, TXT, MD MIME types and extensions
  - [ ] 3.9 Write integration test: upload ODT fixture → candidate record created with non-empty `cv_text`; upload RTF fixture → same; upload `.xls` → 400 error
  - [ ] 3.10 Verify all tests pass: `npm run test`

- [ ] 4. PDF export — all four artefact types
  - [ ] 4.1 Install `@react-pdf/renderer`: `npm install @react-pdf/renderer`
  - [ ] 4.2 Create `src/lib/pdf/styles.ts`: shared `StyleSheet` (font sizes, colors #1e293b slate, spacing scale)
  - [ ] 4.3 Build `<RoleDocument />` in `src/lib/pdf/role-pdf.tsx`: role title heading, description prose, requirements bullet list, created date footer
  - [ ] 4.4 Build `<CandidateDocument />` in `src/lib/pdf/candidate-pdf.tsx`: name/email/agency header, 4-bar dimension score summary, per-dimension reasoning sections, AI summary, CV text (max 800 words)
  - [ ] 4.5 Build `<ShortlistDocument />` in `src/lib/pdf/shortlist-pdf.tsx`: role header, ranked table (name, agency, overall score, 4 dimension scores), generated date
  - [ ] 4.6 Build `<InterviewPackDocument />` in `src/lib/pdf/interview-pack-pdf.tsx`: cover page, questions grouped by type (behavioral/technical/situational/cultural), each question with rubric and follow-ups, code challenge section with monospace code blocks, "Confidential" footer
  - [ ] 4.7 Implement `src/lib/pdf/index.ts`: `renderToPdf(component): Promise<Buffer>` using `@react-pdf/renderer renderToBuffer()`
  - [ ] 4.8 Implement all four export routes (`/api/export/shortlist/[roleId]`, `/api/export/candidate/[candidateId]`, `/api/export/role/[roleId]`, `/api/export/interview-pack/[packId]`) — fetch data with tenant RLS, render PDF, return with correct Content-Type and Content-Disposition headers
  - [ ] 4.9 Write integration tests for export routes: correct content-type; cross-tenant ID → 404; pending pack → 400
  - [ ] 4.10 Add "Download PDF" `<a>` buttons to: candidate profile page, role detail page, interview pack page
  - [ ] 4.11 Verify all tests pass: `npm run test`
