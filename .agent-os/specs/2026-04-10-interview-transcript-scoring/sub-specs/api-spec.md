# API Specification

This is the API specification for the spec detailed in @.agent-os/specs/2026-04-10-interview-transcript-scoring/spec.md

> Created: 2026-04-10
> Version: 1.0.0

## Endpoints

---

### POST `/api/transcripts/upload`

**Purpose:** Upload a transcript file or paste text, parse it, store it, and trigger background AI analysis.

**Auth:** Session required. Role: `recruiter` or `admin` (viewer forbidden).

**Request:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File | Conditional | Transcript file (.vtt, .srt, .docx, .txt, .pdf). Required if `pastedText` not provided. |
| `pastedText` | string | Conditional | Raw transcript text. Required if `file` not provided. |
| `candidateId` | string (UUID) | Yes | Candidate this transcript belongs to |
| `roleId` | string (UUID) | Yes | Role context for AI scoring |
| `packId` | string (UUID) | No | Link to interview pack for question-mapping |
| `sourcePlatform` | string | No | `teams \| zoom \| meet \| other` (default: `other`) |
| `interviewDate` | string (ISO 8601) | No | Date of interview |

**Validation:**
- Must provide either `file` OR `pastedText`, not both, not neither
- `file` max size: 5 MB
- `file` accepted MIME types: `text/vtt`, `application/x-subrip`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `text/plain`, `application/pdf`
- `candidateId` must belong to the requesting tenant
- `roleId` must belong to the requesting tenant
- `packId` (if provided) must belong to the requesting tenant and match `candidateId`

**Success Response:** `201 Created`
```json
{
  "transcriptId": "uuid",
  "candidateId": "uuid",
  "analysisStatus": "pending"
}
```

**Error Responses:**

| Status | Code | Reason |
|--------|------|--------|
| 400 | `MISSING_CONTENT` | Neither file nor pastedText provided |
| 400 | `FILE_TOO_LARGE` | File exceeds 5 MB |
| 400 | `UNSUPPORTED_FORMAT` | File type not accepted |
| 400 | `INVALID_CANDIDATE` | candidateId not found in tenant |
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | Role is `viewer` |

**Implementation notes:**
- Parse transcript → `{rawText, cues}` using `src/lib/parsers/transcript.ts`
- Insert `interview_transcripts` record with `analysisStatus: 'pending'`
- Call `triggerTranscriptAnalysis(transcriptId, tenantId)` fire-and-forget after response
- Pattern mirrors `src/app/api/candidates/bulk-upload/route.ts`

---

### GET `/api/transcripts/[transcriptId]`

**Purpose:** Fetch a transcript record with its analysis (if complete).

**Auth:** Session required. All roles.

**Path params:** `transcriptId` (UUID)

**Success Response:** `200 OK`
```json
{
  "id": "uuid",
  "candidateId": "uuid",
  "roleId": "uuid",
  "packId": "uuid | null",
  "sourcePlatform": "zoom",
  "sourceFormat": "vtt",
  "interviewDate": "2026-04-10T14:00:00Z",
  "analysisStatus": "complete",
  "analysis": {
    "overallScore": 74,
    "communicationScore": 82,
    "technicalDepthScore": 70,
    "problemSolvingScore": 75,
    "socialFitScore": 68,
    "communicationReasoning": "Candidate answered clearly...",
    "technicalDepthReasoning": "...",
    "problemSolvingReasoning": "...",
    "socialFitReasoning": "...",
    "summary": "Strong communicator with solid technical grounding...",
    "strengths": ["Clear explanations", "Good system design instincts"],
    "redFlags": ["Struggled with concurrency question"],
    "recommendedDecision": "proceed",
    "questionResponses": [
      {
        "questionText": "Describe a time you debugged a production incident...",
        "transcriptExcerpt": "Yeah so we had this Kafka lag issue at 2am...",
        "quality": "strong",
        "notes": "Gave specific, structured answer with clear outcome"
      }
    ]
  }
}
```

When `analysisStatus` is `pending` or `analyzing`, `analysis` is `null`.
When `analysisStatus` is `failed`, `analysis` is `null` and `errorMessage` is populated.

**Error Responses:**

| Status | Reason |
|--------|--------|
| 401 | No session |
| 404 | Transcript not found or not in tenant |

---

### GET `/api/transcripts/[transcriptId]/status`

**Purpose:** Lightweight poll endpoint for frontend to check analysis progress.

**Auth:** Session required.

**Path params:** `transcriptId` (UUID)

**Success Response:** `200 OK`
```json
{
  "analysisStatus": "analyzing",
  "overallScore": null
}
```

When complete:
```json
{
  "analysisStatus": "complete",
  "overallScore": 74
}
```

**Frontend polling pattern:**
```typescript
// Poll every 3 seconds (same as CV score polling)
const { data } = useQuery({
  queryKey: ['transcript-status', transcriptId],
  queryFn: () => fetch(`/api/transcripts/${transcriptId}/status`).then(r => r.json()),
  refetchInterval: (data) =>
    data?.analysisStatus === 'complete' || data?.analysisStatus === 'failed' ? false : 3000,
})
```

---

### GET `/api/candidates/[candidateId]/transcripts`

**Purpose:** List all transcripts for a candidate (across all roles).

**Auth:** Session required. All roles.

**Path params:** `candidateId` (UUID)

**Query params:**
- `roleId` (optional) — filter to specific role
- `limit` (default 10, max 50)
- `offset` (default 0)

**Success Response:** `200 OK`
```json
{
  "transcripts": [
    {
      "id": "uuid",
      "roleId": "uuid",
      "roleTitle": "Senior Backend Engineer",
      "sourcePlatform": "zoom",
      "interviewDate": "2026-04-10T14:00:00Z",
      "analysisStatus": "complete",
      "overallScore": 74,
      "recommendedDecision": "proceed",
      "createdAt": "2026-04-10T15:30:00Z"
    }
  ],
  "total": 1,
  "limit": 10,
  "offset": 0
}
```

---

## Server Action

```typescript
// src/actions/transcripts.ts
'use server'

export type UploadTranscriptState =
  | { success: true; transcriptId: string }
  | { success: false; error: string }

export async function uploadTranscript(
  _prev: UploadTranscriptState | null,
  formData: FormData
): Promise<UploadTranscriptState>
```

Used by `TranscriptUploadForm` with `useActionState`. Calls `POST /api/transcripts/upload` and returns `transcriptId` on success.
