# Spec Tasks

These are the tasks to be completed for the spec detailed in @.agent-os/specs/2026-04-09-interview-question-generator/spec.md

> Created: 2026-04-09
> Status: Ready for Implementation
> Depends on: core-mvp-foundation Tasks 1-2 (scaffold + DB schema must exist)

## Tasks

- [ ] 1. Database schema — interview_packs, interview_questions, code_challenges tables
  - [ ] 1.1 Write integration test: RLS — interview_pack from Tenant A returns 404 for Tenant B session
  - [ ] 1.2 Add Drizzle schema file `src/db/schema/interview-packs.ts` with `interviewPacks`, `interviewQuestions`, `code_challenges` tables per database-schema.md
  - [ ] 1.3 Add RLS policies for all three new tables (same pattern as candidates/scores)
  - [ ] 1.4 Run `npm run db:generate` → inspect migration output; verify all tables, indexes, constraints, JSONB columns
  - [ ] 1.5 Install `shiki` for syntax highlighting: `npm install shiki`
  - [ ] 1.6 Verify tests pass: `npm run test`

- [ ] 2. AI pipeline — CV profile extraction + question generation
  - [ ] 2.1 Write unit tests for `CvProfileSchema`: valid profile passes; `experience_level` outside enum fails; `companies` over 5 fails
  - [ ] 2.2 Write unit tests for `InterviewPackSchema`: valid pack passes; question count below 6 fails; invalid `question_type` fails; `follow_ups` over 2 items fails
  - [ ] 2.3 Write unit tests for `inferExperienceLevel()`: "8 years" → senior; "2 years" → junior; "Senior Engineer" title → senior; no indicators → mid
  - [ ] 2.4 Write unit tests for `inferLanguage()`: TypeScript in skills → TypeScript; Python only → Python; empty → TypeScript default
  - [ ] 2.5 Add `CvProfileSchema` and `InterviewPackSchema` to `src/lib/ai/schemas.ts`
  - [ ] 2.6 Implement `inferExperienceLevel(cvText: string)` and `inferLanguage(skills: string[])` helpers in `src/lib/ai/interview.ts`
  - [ ] 2.7 Implement `extractCvProfile(cvText: string): Promise<CvProfile>` — Stage 1 Claude call with CV extraction prompt and Zod validation
  - [ ] 2.8 Implement `generateQuestions(cvProfile, role, options): Promise<InterviewPack>` — Stage 2 Claude call with role-cached context, candidate personalisation prompt, and Zod validation; apply `cache_control: { type: 'ephemeral' }` to role content block
  - [ ] 2.9 Write unit tests for `extractCvProfile()`: valid mock → returns CvProfile; malformed response → throws ZodError
  - [ ] 2.10 Write unit tests for `generateQuestions()`: question distribution correct; with code challenge flag → code_challenge present; without flag → undefined
  - [ ] 2.11 Verify all tests pass: `npm run test`

- [ ] 3. Server actions + API routes
  - [ ] 3.1 Write integration test for `createInterviewPack`: valid input + mocked Claude → pack complete, questions inserted; cross-tenant candidateId → error; Claude Stage 1 failure → pack failed
  - [ ] 3.2 Implement `createInterviewPack(formData)` server action in `src/actions/interview.ts`: validate inputs, infer experience level, insert pack record, fire-and-forget `_generateInterviewPack()`
  - [ ] 3.3 Implement `_generateInterviewPack(packId)`: Stage 1 → Stage 2 → bulk insert questions → optional code challenge → update status to complete/failed
  - [ ] 3.4 Implement `deleteInterviewPack(packId)` server action: verify tenant ownership, delete pack (cascade), revalidatePath
  - [ ] 3.5 Implement `updateQuestionNotes(questionId, notes)` server action: verify tenant, update `interviewer_notes`
  - [ ] 3.6 Write integration test for `GET /api/interview-packs/[packId]`: complete pack returns questions array; pending pack returns partial; cross-tenant → 404
  - [ ] 3.7 Implement `GET /api/interview-packs/[packId]` route: fetch pack + questions (ordered by `display_order`) + code_challenge; return full JSON per api-spec
  - [ ] 3.8 Write integration test for `GET /api/candidates/[id]/interview-packs`: returns packs with correct question counts; empty for no packs
  - [ ] 3.9 Implement `GET /api/candidates/[id]/interview-packs` route: list packs summary with question count aggregate
  - [ ] 3.10 Verify all tests pass: `npm run test`

- [ ] 4. UI components
  - [ ] 4.1 Write component test for `<PackGenerator />`: button renders; modal opens on click; submit calls server action; loading state disables button
  - [ ] 4.2 Build `<PackGenerator />` component (`src/components/interview/pack-generator.tsx`): "Generate Interview Pack" button → shadcn/ui Dialog modal → role selector + code challenge checkbox → submit → optimistic loading state; polls `GET /api/interview-packs/[packId]` every 2s until complete
  - [ ] 4.3 Write component test for `<QuestionCard />`: renders question text and badges; rubric expands on click; notes textarea calls updateQuestionNotes on blur
  - [ ] 4.4 Build `<QuestionCard />` component (`src/components/interview/question-card.tsx`): question text, type/difficulty/personalization badges, shadcn/ui Accordion for rubric (strong/acceptable/weak) and follow-ups, Textarea for interviewer notes
  - [ ] 4.5 Write component test for `<CodeChallenge />`: renders problem description; syntax-highlighted code blocks; evaluation criteria badges
  - [ ] 4.6 Build `<CodeChallenge />` component (`src/components/interview/code-challenge.tsx`): problem description prose block, `shiki` syntax-highlighted starter code and unit tests in tabs (shadcn/ui Tabs), difficulty/time/language badges, evaluation criteria as Badge list
  - [ ] 4.7 Write component test for `<PackList />`: renders packs; "Generating..." for pending; delete calls action with confirmation
  - [ ] 4.8 Build `<PackList />` component (`src/components/interview/pack-list.tsx`): list of packs per candidate with role title, date, question count, status badge; delete button with confirmation dialog
  - [ ] 4.9 Verify all component tests pass: `npm run test`

- [ ] 5. Interview pack page + candidate profile integration
  - [ ] 5.1 Build interview pack page `src/app/(dashboard)/candidates/[id]/interview/[packId]/page.tsx`: TanStack Query fetches `GET /api/interview-packs/[packId]`; polls while `pending`/`processing`; renders pack summary header, questions grouped by category (shadcn/ui Tabs or section headers), `<CodeChallenge />` at bottom; "Print" button triggers `window.print()` with CSS print styles hiding nav/sidebar
  - [ ] 5.2 Add `<PackGenerator />` and `<PackList />` to candidate profile page `src/app/(dashboard)/candidates/[id]/page.tsx` — below the score chart section
  - [ ] 5.3 Add print styles to `src/app/globals.css`: hide sidebar, nav, action buttons on `@media print`; question cards display block without accordion collapse
  - [ ] 5.4 Run Playwright E2E smoke test: login → upload CV → score candidate → click "Generate Interview Pack" → wait for completion → verify questions visible → click first question → verify rubric expands
  - [ ] 5.5 Verify all tests pass: `npm run test && npm run test:e2e`
  - [ ] 5.6 Verify browser deliverables: generate pack from profile page, view questions with rubrics, print interview sheet
