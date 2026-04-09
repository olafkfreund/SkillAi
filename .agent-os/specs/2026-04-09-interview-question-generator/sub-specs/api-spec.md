# API Specification

This is the API specification for the spec detailed in @.agent-os/specs/2026-04-09-interview-question-generator/spec.md

> Created: 2026-04-09
> Version: 1.0.0

## Server Actions

### `createInterviewPack(formData: FormData)`

**File:** `src/actions/interview.ts`
**Auth:** recruiter, admin
**Purpose:** Trigger Claude two-stage pipeline and persist results

**Input (FormData):**
- `candidateId` — UUID, required
- `roleId` — UUID, required
- `includeCodeChallenge` — boolean string ('true'/'false'), default 'false'

**Behaviour:**
1. Validate inputs with Zod; verify candidate + role belong to current tenant
2. Infer `experienceLevel` from candidate CV text (scan for years of experience + job titles)
3. Insert `interview_packs` record with `generation_status = 'pending'`
4. Call `generateInterviewPack()` fire-and-forget (does not await)
5. Return `{ packId: string }`

**`generateInterviewPack()` internal flow:**
1. Set `generation_status = 'processing'`
2. **Stage 1:** Call Claude with CV text → parse into `CvProfile` (Zod validated)
3. **Stage 2:** Call Claude with role-cached context + CvProfile → get `InterviewPack` (Zod validated)
4. Bulk-insert all questions into `interview_questions` with `display_order` (behavioral first, then technical, situational, cultural)
5. If `includeCodeChallenge`: insert `code_challenges` record
6. Update `interview_packs` with `generation_status = 'complete'`, `generated_at = NOW()`
7. On any error: set `generation_status = 'failed'`, `error_message = error.message`

---

### `deleteInterviewPack(packId: string)`

**File:** `src/actions/interview.ts`
**Auth:** recruiter, admin
**Purpose:** Delete a pack and all its questions (cascade)

**Behaviour:**
1. Verify pack belongs to current tenant
2. Delete from `interview_packs` — cascades to `interview_questions` and `code_challenges`
3. `revalidatePath('/candidates/[id]')`

---

### `updateQuestionNotes(questionId: string, notes: string)`

**File:** `src/actions/interview.ts`
**Auth:** recruiter, admin, viewer (viewers can add notes)
**Purpose:** Save interviewer notes on a question during/after interview

**Behaviour:**
1. Verify question belongs to current tenant
2. Update `interview_questions.interviewer_notes`
3. Return success

---

## API Routes

### `GET /api/interview-packs/[packId]`

**File:** `src/app/api/interview-packs/[packId]/route.ts`
**Auth:** all authenticated roles
**Purpose:** Fetch full pack with all questions and code challenge — used for both polling status and rendering the pack page

**Response `200`:**
```json
{
  "id": "uuid",
  "candidateId": "uuid",
  "candidateName": "Jane Smith",
  "roleId": "uuid",
  "roleTitle": "Senior TypeScript Engineer",
  "packSummary": "Focused on TypeScript architecture and team leadership...",
  "recommendedDurationMinutes": 60,
  "experienceLevel": "senior",
  "includesCodeChallenge": true,
  "generationStatus": "complete",
  "generatedAt": "2026-04-09T11:00:00Z",
  "modelUsed": "claude-sonnet-4-6",
  "questions": [
    {
      "id": "uuid",
      "questionText": "You led the API redesign at CompanyX — walk us through the key architectural decision...",
      "questionType": "behavioral",
      "difficulty": "senior",
      "competency": "System Thinking",
      "personalizationLevel": "high",
      "estimatedDurationMinutes": 8,
      "cvReferences": ["Led API redesign at CompanyX (2023)"],
      "answerSignalStrong": "Discusses trade-offs explicitly, mentions stakeholder alignment...",
      "answerSignalAcceptable": "Describes the change with some reasoning...",
      "answerSignalWeak": "Cannot articulate why the decision was made...",
      "followUps": [
        { "trigger": "If they focus only on technical aspects", "question": "How did the team respond to the change?" }
      ],
      "interviewerNotes": null,
      "displayOrder": 1
    }
  ],
  "codeChallenge": {
    "id": "uuid",
    "title": "Rate-Limited API Client",
    "difficulty": "senior",
    "estimatedMinutes": 60,
    "language": "TypeScript",
    "problemDescription": "Build a TypeScript HTTP client that...",
    "starterCode": "interface RateLimitedClient {\n  get(url: string): Promise<Response>\n}",
    "unitTests": "import { describe, it, expect } from 'vitest'\n...",
    "evaluationCriteria": ["Error handling", "Type safety", "Rate limit logic", "Test coverage"]
  }
}
```

**Polling:** Client polls every 2s when `generationStatus = 'pending' | 'processing'`; stops on `'complete' | 'failed'`

**Error `404`:** Pack not found or belongs to different tenant

---

### `GET /api/candidates/[id]/interview-packs`

**File:** `src/app/api/candidates/[id]/interview-packs/route.ts`
**Auth:** all authenticated roles
**Purpose:** List all packs for a candidate (summary only — no questions in list view)

**Response `200`:**
```json
{
  "data": [
    {
      "id": "uuid",
      "roleTitle": "Senior TypeScript Engineer",
      "experienceLevel": "senior",
      "questionCount": 10,
      "includesCodeChallenge": true,
      "generationStatus": "complete",
      "generatedAt": "2026-04-09T11:00:00Z"
    }
  ]
}
```

---

## Role Permissions

| Action | admin | recruiter | viewer |
|---|---|---|---|
| Generate pack | ✓ | ✓ | ✗ |
| View pack | ✓ | ✓ | ✓ |
| Add interviewer notes | ✓ | ✓ | ✓ |
| Delete pack | ✓ | ✓ | ✗ |
