# Tests Specification

This is the tests coverage details for the spec detailed in @.agent-os/specs/2026-04-10-interview-transcript-scoring/spec.md

> Created: 2026-04-10
> Version: 1.0.0

## Test Coverage

---

### Unit Tests

**`src/lib/parsers/transcript.ts` — Transcript Parser**

- Parses a valid VTT file with speaker attribution into structured cues `{speaker, timestamp, text}[]`
- Parses a valid SRT file with `Name: text` speaker pattern into structured cues
- Parses a VTT file with no speaker tags — speaker defaults to `'Unknown'`
- Parses a VTT file with multiple speakers, correctly attributes each cue
- Handles empty VTT/SRT input gracefully (returns empty cues array)
- Plain text input returns single cue `{speaker: 'Unknown', timestamp: 0, text: fullText}`
- Timestamps correctly converted from VTT `HH:MM:SS.mmm` to milliseconds
- Timestamps correctly converted from SRT `HH:MM:SS,mmm` to milliseconds

**`src/lib/ai/transcript-schemas.ts` — Zod Schema Validation**

- `TranscriptAnalysisSchema` accepts valid AI output with all required fields
- Rejects output with `overall_score` outside 0-100
- Rejects output with missing `recommended_decision`
- Accepts `question_responses: []` (empty array for non-pack transcripts)
- Coerces `question_responses` to empty array when omitted
- Rejects invalid `recommended_decision` value (not `proceed | consider | decline`)
- Rejects `strengths` array with more than 5 items

**`src/lib/ai/transcript-analysis.ts` — Analysis Pipeline**

- `analyzeTranscriptWithClaude()` calls Claude with correct tool schema
- Validates Claude response against `TranscriptAnalysisSchema`
- Throws descriptive error when Claude returns no `tool_use` block
- Throws descriptive error when Claude response fails Zod validation
- When `packQuestions` provided, includes question context in prompt
- When `packQuestions` empty/undefined, prompt omits question section

---

### Integration Tests

**`POST /api/transcripts/upload`**

- Accepts VTT file upload with valid `candidateId` + `roleId` → returns `201` with `transcriptId`
- Accepts SRT file upload → returns `201`
- Accepts DOCX file upload → returns `201`
- Accepts TXT file upload → returns `201`
- Accepts `pastedText` field (no file) → returns `201`
- Rejects request with neither `file` nor `pastedText` → returns `400 MISSING_CONTENT`
- Rejects file over 5 MB → returns `400 FILE_TOO_LARGE`
- Rejects unsupported file type (e.g., `.mp4`) → returns `400 UNSUPPORTED_FORMAT`
- Rejects unauthenticated request → returns `401`
- Rejects `viewer` role → returns `403`
- Rejects `candidateId` belonging to different tenant → returns `400 INVALID_CANDIDATE`
- Inserts `interview_transcripts` record with `analysisStatus: 'pending'`
- Fires background analysis task (mock `triggerTranscriptAnalysis` — verify it was called)

**`GET /api/transcripts/[transcriptId]`**

- Returns full transcript + analysis when `analysisStatus: 'complete'`
- Returns transcript with `analysis: null` when `analysisStatus: 'pending'`
- Returns `404` for transcriptId belonging to different tenant
- Returns `401` for unauthenticated request

**`GET /api/transcripts/[transcriptId]/status`**

- Returns `{analysisStatus: 'pending', overallScore: null}` when pending
- Returns `{analysisStatus: 'complete', overallScore: 74}` when complete
- Returns `{analysisStatus: 'failed', overallScore: null}` when failed

**`GET /api/candidates/[candidateId]/transcripts`**

- Returns list of transcripts for candidate with correct fields
- Filters by `roleId` when provided
- Returns empty array for candidate with no transcripts
- Returns `404` for candidateId belonging to different tenant

**RLS Tenant Isolation**

- Tenant A cannot read Tenant B's `interview_transcripts` records (direct DB query test)
- Tenant A cannot read Tenant B's `transcript_analyses` records
- API endpoints enforce tenant isolation via `withTenant()` wrapper

---

### Feature / E2E Tests

**Full Transcript Upload → Analysis Flow**

1. Authenticated recruiter POSTs a VTT file to `/api/transcripts/upload`
2. Record inserted with `analysisStatus: 'pending'`
3. Background `triggerTranscriptAnalysis()` runs (mocked Claude response)
4. Status endpoint returns `'complete'`
5. Full transcript endpoint returns analysis with scores, strengths, red flags, decision

**Paste Text Flow**

1. Recruiter POSTs `pastedText` (no file)
2. System creates transcript record with `sourceFormat: 'paste'`
3. Analysis runs and completes identically to file upload flow

**Pack-Linked Analysis**

1. Upload transcript with a valid `packId`
2. Analysis includes `questionResponses` array with at least one entry
3. Each response maps to a question from the pack

---

### Mocking Requirements

- **Claude API (`@anthropic-ai/sdk`):** Mock `anthropic.messages.create()` to return a deterministic `tool_use` response matching `TranscriptAnalysisSchema` in all integration/e2e tests. Never call real API in tests.
- **`triggerTranscriptAnalysis()`:** Mock in upload route tests to verify it was called with correct `transcriptId` and `tenantId` without running the background job.
- **Database (Drizzle):** Use real test database with RLS enabled (same pattern as existing integration tests). No mocking of DB queries.
- **File system:** Use in-memory `Buffer` for file parsing tests; no actual disk writes needed.
- **`after()` (Next.js):** In tests, replace `after()` with direct `await` so background task runs synchronously and can be inspected.
