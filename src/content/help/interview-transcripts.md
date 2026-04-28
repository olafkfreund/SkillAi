---
title: "Interview transcript analysis"
category: "AI Scoring & Interviews"
audience: ["recruiter", "admin"]
order: 22
lastUpdated: "2026-04-28"
tags: ["transcript", "interview", "vtt", "srt", "analysis", "second-opinion"]
---

# Interview transcript analysis

You ran the interview. The candidate said all the right things. Or did they? Transcript analysis lets the AI read the actual conversation and score it against the role — a structured second opinion, ready in a couple of minutes.

## Why this exists

CV scoring tells you what the candidate *says* they can do. Interview transcript analysis tells you how they actually performed in the room. Together they're a much fuller picture than either alone — and the transcript score often disagrees with the CV score in interesting ways. A candidate with a great CV who flounders on basics gets caught here; a candidate with a mid-range CV who is clearly excellent in conversation also gets caught here.

## Why we do this with manual upload (not API integration)

SkillAI does **not** integrate directly with Zoom, Teams or Google Meet APIs. You export the transcript file from your meeting platform and upload it. The reason is simple: data sovereignty. We don't want transcript data flowing through third-party SaaS aggregators (DEC-007). Manual upload takes 15 seconds and works with every meeting platform that exists.

## Supported formats

| Format | Extension | Notes |
|---|---|---|
| WebVTT | `.vtt` | Default export from Zoom, Teams (cloud recordings), Google Meet. |
| SubRip | `.srt` | Common subtitle export. |
| Word | `.docx` | If your platform exports a "Meeting notes" doc. |
| Plain text | `.txt` | Works for any tool that gives you raw text. |

You can also paste the text directly into the form — useful for transcripts copied from a chat client or AI notetaker.

## Uploading a transcript

From the candidate detail page (when viewed in the context of a role), open **Interview transcripts** and click **New transcript**:

1. Pick the **platform** (Teams, Zoom, Meet, or Other) — purely informational, but it helps you tell transcripts apart later.
2. Either **drop the file** or paste the text.
3. (Optional) Link the transcript to an interview pack you generated earlier. The AI will then score the answers specifically against the questions you asked.
4. Submit.

Upload is instant. Analysis takes 30–120 seconds depending on transcript length, and you'll see a live status: `pending` → `analyzing` → `complete` (or `failed`). The page polls every 3 seconds, so just wait — no need to refresh.

## What you get back

A **transcript score** card with:

- **Overall transcript score** (0–100) — how well the candidate performed in the conversation, weighted against the role.
- **Per-dimension scores** mirroring the CV dimensions (technical skills, experience level, cultural fit, communication), each with reasoning specific to what was actually said.
- **Strengths** — moments where the candidate was strong, with quotes.
- **Concerns** — moments where they were weak, evasive, or factually off. Quoted, with timestamps where the source format includes them.
- **Coverage map** (if linked to an interview pack) — which questions from the pack were answered, partly answered, or skipped.

## Typical patterns

- **CV score high, transcript score low.** Possibly an over-polished CV. Worth a second interview, or a hard pass.
- **CV score mid, transcript score high.** Underrated candidate. The CV was a poor advertisement; the human is better than the document. Promote.
- **Both high.** Confirmation. Move forward.
- **Both low.** Easy decision.
- **Big gap on one specific dimension** (e.g. CV says "team lead", transcript shows zero leadership stories). That's the question to follow up on in the next round.

## Limits and gotchas

- **Speaker attribution depends on the source format.** VTT from Zoom is usually clean. Plain text pasted from a chat client may merge speakers. Garbage in, garbage out — the AI works with what it's given.
- **Transcripts from very short calls are noisy.** A 10-minute pre-screen with three questions doesn't have enough signal to score against four dimensions. The card will mention this.
- **Translated transcripts work** but lose nuance — particularly on the communication dimension. Score the transcript in its original language if you can.
- **Viewers cannot upload transcripts.** Upload requires recruiter or admin role.

## See also

- [How AI scoring works](/dashboard/help/ai-how-scoring-works)
- [Interview pack generation](/dashboard/help/interview-packs)
- [Troubleshooting common issues](/dashboard/help/troubleshooting-common-issues)
