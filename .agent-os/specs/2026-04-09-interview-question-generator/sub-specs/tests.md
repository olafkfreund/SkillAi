# Tests Specification

This is the tests coverage for the spec detailed in @.agent-os/specs/2026-04-09-interview-question-generator/spec.md

> Created: 2026-04-09
> Version: 1.0.0

## Mocking Requirements

| Service | Strategy |
|---|---|
| Claude API (Stage 1 — CV extraction) | `vi.mock` returning fixture `CvProfile` JSON |
| Claude API (Stage 2 — question generation) | `vi.mock` returning fixture `InterviewPack` JSON |
| Database | Real test DB (no mocks) — same pattern as core MVP spec |

Fixtures in `tests/fixtures/cv-profile.json` and `tests/fixtures/interview-pack.json`.

---

## Unit Tests

### `src/lib/ai/schemas.ts` — `InterviewPackSchema`

- Valid full pack (10 questions + code challenge) → passes
- Questions array below min (5) → fails
- `question_type` outside enum → fails
- `personalization_level` outside enum → fails
- `answer_signal_strong` missing → fails
- `follow_ups` exceeding max 2 items → fails

### `src/lib/ai/schemas.ts` — `CvProfileSchema`

- Valid extracted profile → passes
- `experience_level` outside enum → fails
- `companies` array exceeding max 5 → fails (truncated by prompt, validated here)

### `src/lib/ai/interview.ts` — `extractCvProfile()`

- Valid Claude mock → returns `CvProfile` object
- Claude returns malformed JSON → throws `ZodError`
- Claude API error → throws with message

### `src/lib/ai/interview.ts` — `generateQuestions()`

- Valid CvProfile + role → returns `InterviewPack` with 8-12 questions
- Question distribution correct: behavioral ~40%, technical ~35%, rest ~25%
- At least one question has `personalization_level: 'high'` when CvProfile has `personalizable_moments`
- `includeCodeChallenge: false` → `code_challenge` is undefined in response
- `includeCodeChallenge: true` → `code_challenge` is present

### `src/lib/ai/interview.ts` — `inferExperienceLevel()`

- CV with "8 years" → `senior`
- CV with "2 years" → `junior`
- CV with "Senior Engineer" title → `senior` (even with no years stated)
- CV with no experience indicators → `mid` (safe default)

### `src/lib/ai/interview.ts` — `inferLanguage()`

- `technical_skills` includes 'TypeScript' → `'TypeScript'`
- `technical_skills` includes 'Python' but not TypeScript → `'Python'`
- `technical_skills` is empty → `'TypeScript'` (default)

---

## Integration Tests

All against real test DB with tenant context set.

### `createInterviewPack` Server Action

- Valid candidateId + roleId for current tenant → `interview_packs` row inserted with `generation_status='pending'`; returns `{ packId }`
- `candidateId` from different tenant → returns permission error
- Missing `roleId` → Zod validation error
- Mocked Claude (Stage 1 + Stage 2) → pack transitions to `complete`; `interview_questions` rows inserted (8-12)
- With `includeCodeChallenge: true` → `code_challenges` row inserted
- Claude Stage 1 failure → pack marked `failed` with `error_message`
- Claude Stage 2 failure (Stage 1 succeeds) → pack marked `failed`

### `updateQuestionNotes` Server Action

- Valid questionId → `interviewer_notes` updated in DB
- Question from different tenant → returns error

### `GET /api/interview-packs/[packId]`

- Complete pack → returns full response with questions array and codeChallenge
- `generation_status = 'pending'` pack → returns partial record (no questions yet)
- Cross-tenant packId → 404
- Non-existent UUID → 404
- Question `display_order` → behavioral questions appear before technical

### `GET /api/candidates/[id]/interview-packs`

- Returns all packs for candidate with correct question counts
- Returns empty array for candidate with no packs
- Cross-tenant candidateId → 404

---

## Component Tests

### `<PackGenerator />`

- "Generate Interview Pack" button renders
- Clicking opens modal with role selector + code challenge toggle
- Submit calls `createInterviewPack` server action
- Loading state shows spinner; disabled state prevents double-submit

### `<QuestionCard />`

- Renders `question_text`, type badge, difficulty badge
- "Show rubric" expand reveals strong/acceptable/weak signals
- "Show follow-ups" expand reveals follow-up questions
- Notes textarea calls `updateQuestionNotes` on blur

### `<CodeChallenge />`

- Renders problem description + starter code + unit tests in syntax-highlighted blocks
- Language badge shows correct language
- Estimated time displayed
- Evaluation criteria listed as badges

### `<PackList />`

- Renders list of packs with role title, question count, date
- "Generating..." status for `pending`/`processing` packs
- "Failed" badge with error tooltip for `failed` packs
- Delete button calls `deleteInterviewPack`; confirms before deleting

---

## Test File Layout

```
tests/
├── unit/
│   └── ai/
│       ├── interview-schemas.test.ts
│       └── interview.test.ts
├── integration/
│   ├── actions/
│   │   └── createInterviewPack.test.ts
│   └── api/
│       ├── interview-packs-id.test.ts
│       └── candidate-interview-packs.test.ts
├── components/
│   ├── pack-generator.test.tsx
│   ├── question-card.test.tsx
│   ├── code-challenge.test.tsx
│   └── pack-list.test.tsx
└── fixtures/
    ├── cv-profile.json          # CvProfile fixture
    └── interview-pack.json      # InterviewPack fixture (10 questions + code challenge)
```
