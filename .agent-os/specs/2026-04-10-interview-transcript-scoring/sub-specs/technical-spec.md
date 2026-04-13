# Technical Specification

This is the technical specification for the spec detailed in @.agent-os/specs/2026-04-10-interview-transcript-scoring/spec.md

> Created: 2026-04-10
> Version: 1.0.0

## Technical Requirements

- Accept transcript files in VTT, SRT, DOCX, TXT, PDF formats (max 5 MB — transcripts are text-heavy but small)
- Parse VTT/SRT into structured cues `{speaker: string, timestamp: number, text: string}[]`
- Reuse existing `parseFile()` dispatcher from `src/lib/parsers/index.ts` for DOCX, PDF, TXT
- Store raw transcript text and parsed cues (JSONB) in `interview_transcripts` table
- Fire-and-forget background AI analysis using Next.js `after()` (same pattern as `triggerScoring()` in `src/lib/ai/scoring.ts`)
- Claude structured output with `tool_use` enforcing `TranscriptAnalysisSchema` (Zod-validated)
- RLS enforced on all new tables via `tenant_id` + `current_setting('app.tenant_id', true)::uuid`
- `viewer` role must not be able to upload transcripts (enforce `requireRole(userRole, 'recruiter')`)
- Analysis result displayed on candidate profile page alongside existing CV score card
- Frontend polls `/api/transcripts/[id]/status` every 3 seconds until `complete` or `failed` (same pattern as CV score polling)

## Approach Options

**Option A: Store raw transcript as encrypted blob**
- Pros: Maximum privacy; raw text cannot be read even with DB access
- Cons: Requires key management, complicates search/display, adds complexity
- **Not selected** — SkillAI is a self-hosted internal tool; application-level RLS + volume encryption is sufficient for MVP

**Option B: Store raw transcript as plain text with RLS isolation (Selected)**
- Pros: Consistent with how `cvText` is stored on `candidates`; simpler implementation; full RLS tenant isolation
- Cons: DBA with DB access can read transcripts; mitigation: same as CV text storage
- **Rationale:** SkillAI stores CV full text in plain text today. Transcripts are treated identically. For orgs requiring field-level encryption, this can be added as a Phase 2 hardening step.

**Option C: Store only the analysis, not the raw transcript**
- Pros: Minimises PII stored
- Cons: Cannot re-run analysis, cannot display transcript in UI, loses auditability
- **Not selected** — raw transcript needed for re-scoring and future display

## Transcript Parsing

### VTT Format (Zoom, Teams export)

```
WEBVTT

00:00:01.000 --> 00:00:04.500
<v Interviewer>Tell me about your experience with distributed systems.

00:00:05.000 --> 00:00:18.000
<v Candidate>Sure, at my last role I built a Kafka-based event pipeline...
```

Parser: `subtitle` npm package (MIT, 50k+ weekly downloads, supports VTT + SRT).
Output: `{start: number, end: number, text: string}[]` — speaker extracted from `<v Speaker>` tags.

### SRT Format

```
1
00:00:01,000 --> 00:00:04,500
Interviewer: Tell me about your experience...

2
00:00:05,000 --> 00:00:18,000
Candidate: Sure, at my last role...
```

Parser: same `subtitle` package (handles both VTT and SRT).
Speaker attribution: extracted from leading `Name:` pattern in text.

### DOCX / PDF / TXT

Reuse existing `parseFile(buffer, fileType)` from `src/lib/parsers/index.ts`.
Output: plain text string. Speaker labels preserved as-is from the document text.
Structured cues: `[{speaker: 'Unknown', timestamp: 0, text: fullPlainText}]` — single block when no timestamps available.

## AI Analysis

### Model
`claude-sonnet-4-6` — same model used for CV scoring and interview pack generation.

### Tool Schema (Claude tool_use)
```typescript
const TRANSCRIPT_ANALYSIS_TOOL: Anthropic.Tool = {
  name: 'submit_transcript_analysis',
  input_schema: {
    type: 'object',
    required: ['overall_score', 'dimensions', 'summary', 'strengths', 'red_flags', 'recommended_decision'],
    properties: {
      overall_score: { type: 'integer', minimum: 0, maximum: 100 },
      dimensions: {
        type: 'object',
        required: ['communication', 'technical_depth', 'problem_solving', 'social_fit'],
        properties: {
          communication:    { score (0-100), reasoning (string) },
          technical_depth:  { score (0-100), reasoning (string) },
          problem_solving:  { score (0-100), reasoning (string) },
          social_fit:       { score (0-100), reasoning (string) },
        }
      },
      summary: { type: 'string' },
      strengths: { type: 'array', items: { type: 'string' }, maxItems: 5 },
      red_flags: { type: 'array', items: { type: 'string' }, maxItems: 5 },
      recommended_decision: { type: 'string', enum: ['proceed', 'consider', 'decline'] },
      question_responses: {
        type: 'array',
        items: {
          question_text: string,
          transcript_excerpt: string,
          quality: 'strong' | 'acceptable' | 'weak',
          notes: string
        }
      }
    }
  }
}
```

### Prompt Strategy

**Role context message (ephemeral cache):**
```
You are an expert interview assessor with deep experience evaluating technical candidates.
Analyse this interview transcript and score the candidate honestly and objectively.

ROLE: {role.title}
REQUIREMENTS: {role.requirements}
{if packQuestions:}
INTERVIEW QUESTIONS ASKED:
{packQuestions.map(q => `Q: ${q.questionText}\nStrong answer signals: ${q.strongAnswerSignals.join(', ')}\nWeak signals: ${q.weakAnswerSignals.join(', ')}`).join('\n\n')}
```

**Transcript message:**
```
TRANSCRIPT:
{parsedCues.map(c => `[${c.speaker}]: ${c.text}`).join('\n')}
```

When pack questions are provided, populate `question_responses` by mapping transcript excerpts to each question. When no pack, set `question_responses: []`.

## Background Job Pattern

Identical to `triggerScoring()` in `src/lib/ai/scoring.ts`:

```typescript
// Fire from API route after response sent
triggerTranscriptAnalysis(transcriptId, tenantId).catch(console.error)

async function triggerTranscriptAnalysis(transcriptId: string, tenantId: string) {
  // 1. Mark as analyzing
  // 2. Fetch transcript + role + packQuestions
  // 3. Call analyzeTranscriptWithClaude()
  // 4. Insert transcript_analyses record
  // 5. Update analysisStatus = 'complete'
  // On error: set 'failed' + errorMessage
}
```

## UI Components

### TranscriptUploadForm
- Tab toggle: "Upload File" / "Paste Text"
- File tab: `CvDropzone`-style dropzone, accepted types: `.vtt .srt .docx .txt .pdf`
- Paste tab: `<Textarea>` with platform hint text
- Platform selector: `<Select>` — Teams / Zoom / Google Meet / Other
- Role selector: pre-filled from current candidate context
- Pack selector: optional `<Select>` — "Link to interview pack (optional)"
- Submit → POST `/api/transcripts/upload` → poll status → show analysis

### TranscriptScoreCard
- 4 dimension bars (same visual as `score-chart.tsx`)
- Dimension labels: Communication, Technical Depth, Problem Solving, Social Fit
- Overall score badge
- Recommended decision badge: green (Proceed) / amber (Consider) / red (Decline)

### TranscriptAnalysisView
- Summary paragraph
- Strengths list (green checkmarks)
- Red flags list (amber warnings)
- Question-by-question accordion (only if question_responses non-empty)
  - Shows question text, transcript excerpt, quality badge (Strong / Acceptable / Weak), AI notes

## External Dependencies

- **`subtitle`** (npm) — VTT + SRT parsing
  - Version: `^3.0.0`
  - Justification: Handles both VTT and SRT in one package; MIT license; 50k+ weekly downloads; actively maintained; avoids two separate packages
  - DOCX, PDF, TXT handled by existing `mammoth`, `unpdf`, built-in decode — no new packages needed for those
