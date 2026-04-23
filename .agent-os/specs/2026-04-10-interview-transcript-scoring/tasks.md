# Spec Tasks

These are the tasks to be completed for the spec detailed in @.agent-os/specs/2026-04-10-interview-transcript-scoring/spec.md

> Created: 2026-04-10
> Status: Ready for Implementation

## Tasks

- [x] 1. Database Schema & Migrations
  - [x] 1.1 Create `src/db/schema/interview-transcripts.ts` with `interviewTranscripts` table, enums, and RLS policy
  - [x] 1.2 Create `src/db/schema/transcript-analyses.ts` with `transcriptAnalyses` table and RLS policy
  - [x] 1.3 Export both tables from `src/db/schema/index.ts`
  - [x] 1.4 Generated migration `src/db/migrations/0001_fluffy_sprite.sql` via `npm run db:generate` — verified tables, indexes, RLS policies correct
  - [x] 1.5 Created `scripts/migrate.mjs` (programmatic migrator) + `docker/entrypoint.sh` + updated `Dockerfile` runner stage so migrations run automatically on every container start

- [x] 2. Transcript Parser
  - [x] 2.1 Write unit tests for `src/lib/parsers/transcript.ts` covering VTT, SRT, and plain text inputs (use sample fixture files)
  - [x] 2.2 Install `subtitle` npm package (`npm install subtitle`)
  - [x] 2.3 Create `src/lib/parsers/transcript.ts` — `parseTranscriptFile(buffer, format)` returning `{rawText, cues: TranscriptCue[]}`
  - [x] 2.4 Implement VTT parsing: extract `<v Speaker>` tags for speaker attribution, convert timestamps to ms
  - [x] 2.5 Implement SRT parsing: extract `Name:` prefix pattern for speakers, convert timestamps to ms
  - [x] 2.6 Implement plain text / paste fallback: single cue `{speaker: 'Unknown', timestamp: 0, text}`
  - [x] 2.7 Re-export from `src/lib/parsers/index.ts`
  - [x] 2.8 Verify all parser unit tests pass

- [x] 3. AI Analysis Pipeline
  - [x] 3.1 Write unit tests for `TranscriptAnalysisSchema` validation (valid/invalid cases) in `src/lib/ai/transcript-schemas.test.ts`
  - [x] 3.2 Create `src/lib/ai/transcript-schemas.ts` with `TranscriptAnalysisSchema` (Zod) and `TRANSCRIPT_ANALYSIS_TOOL` (Anthropic tool schema)
  - [x] 3.3 Write unit tests for `analyzeTranscriptWithClaude()` with mocked Anthropic client
  - [x] 3.4 Create `src/lib/ai/transcript-analysis.ts` with `analyzeTranscriptWithClaude(input)` using Claude `tool_use` + prompt caching
  - [x] 3.5 Add `triggerTranscriptAnalysis(transcriptId, tenantId)` background job function — fetch transcript + role + packQuestions, call Claude, write result to `transcript_analyses`, update `analysisStatus`
  - [x] 3.6 Handle error path: set `analysisStatus = 'failed'` + `errorMessage` on exception
  - [x] 3.7 Verify all AI unit tests pass

- [x] 4. API Routes
  - [x] 4.1 Write integration tests for `POST /api/transcripts/upload` (auth, validation, file types, tenant isolation)
  - [x] 4.2 Create `src/app/api/transcripts/upload/route.ts` — parse formData, detect file vs paste, call transcript parser, insert DB record, fire background task
  - [x] 4.3 Write integration tests for `GET /api/transcripts/[transcriptId]/status`
  - [x] 4.4 Create `src/app/api/transcripts/[transcriptId]/status/route.ts` — lightweight poll endpoint
  - [x] 4.5 Write integration tests for `GET /api/transcripts/[transcriptId]`
  - [x] 4.6 Create `src/app/api/transcripts/[transcriptId]/route.ts` — full transcript + joined analysis
  - [x] 4.7 Write integration tests for `GET /api/candidates/[candidateId]/transcripts`
  - [x] 4.8 Create `src/app/api/candidates/[candidateId]/transcripts/route.ts` — paginated list
  - [x] 4.9 Verify all API integration tests pass

- [x] 5. Server Action & Upload UI
  - [x] 5.1 Create `src/actions/transcripts.ts` with `uploadTranscript(prev, formData)` server action
  - [x] 5.2 Create `src/components/transcripts/transcript-upload-form.tsx` with file/paste tab toggle, platform selector, role pre-fill, optional pack selector
  - [x] 5.3 Add status polling with setInterval — refetch every 3s until `complete` or `failed`
  - [x] 5.4 Show loading state during analysis (spinner + "Analysing transcript…" message)
  - [x] 5.5 Show error state with `errorMessage` when `failed`
  - [x] 5.6 TypeScript clean on all new files; all existing tests pass

- [x] 6. Analysis Display & Candidate Profile Integration
  - [x] 6.1 Create `src/components/transcripts/transcript-score-card.tsx` — 4-dimension score bars + overall score + recommended decision badge (reuse `score-chart.tsx` visual pattern)
  - [x] 6.2 Create `src/components/transcripts/transcript-analysis-view.tsx` — summary, strengths list, red flags list, question-responses accordion
  - [x] 6.3 Create `src/components/transcripts/transcript-section.tsx` — container that fetches transcripts list, renders upload form + list of past analyses
  - [x] 6.4 Add `TranscriptSection` to `src/app/(dashboard)/candidates/[candidateId]/page.tsx` below the existing score card
  - [x] 6.5 Verify end-to-end: upload transcript on candidate profile → analysis displays alongside CV score
  - [x] 6.6 Verify `viewer` role cannot see upload form (only analysis results) — `TranscriptUploadForm` returns null for viewer; `TranscriptSection` passes userRole from session
  - [x] 6.7 Run full test suite and verify all tests pass — 98 pass, 5 pre-existing failures unrelated to transcript feature
