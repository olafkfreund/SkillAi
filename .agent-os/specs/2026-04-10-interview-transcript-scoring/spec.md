# Spec Requirements Document

> Spec: Interview Transcript Import & AI Scoring
> Created: 2026-04-10
> Status: Planning

## Overview

Add the ability to import interview transcripts from Teams, Zoom, and Google Meet (via file upload or text paste) and use Claude to automatically score the candidate's answers across communication, technical depth, problem-solving, and social/culture-fit dimensions. This closes the loop on the existing interview pack workflow — from question generation to post-interview scoring — in a single integrated flow.

## User Stories

### Recruiter Uploads Transcript After Interview

As a recruiter, I want to upload the transcript file exported from Zoom (VTT), Teams (VTT/DOCX), or Google Meet (DOCX) after an interview, so that Claude can automatically score the candidate's responses and save me 30–60 minutes of manual note synthesis.

After uploading the file and selecting the associated role and interview pack, the system parses the transcript, triggers a background AI analysis, and within ~30 seconds shows a scored breakdown with strengths, red flags, and a recommended hire/reject decision — all linked to the candidate profile.

### Recruiter Pastes Transcript Text

As a recruiter, I want to paste raw transcript text directly into a text area (for cases where the platform doesn't export a clean file, or the user just copy-pastes the Teams meeting notes), so that I'm not blocked by file format requirements.

The paste flow works identically to the file upload flow — same AI analysis, same output.

### Hiring Manager Reviews Interview Analysis

As a hiring manager, I want to see the AI interview analysis alongside the CV score on the candidate profile, so that I can compare pre-interview CV potential with post-interview demonstrated performance and make faster, better-evidenced hiring decisions.

## Spec Scope

1. **Transcript Upload** - File dropzone accepting VTT, SRT, DOCX, TXT, PDF with platform selector (Teams / Zoom / Google Meet / Other)
2. **Transcript Paste** - Textarea fallback for copy-pasted meeting notes or plain-text transcripts
3. **Transcript Parsing** - Parse VTT/SRT to structured cues `{speaker, timestamp, text}`; DOCX/PDF/TXT via existing parsers
4. **AI Analysis Pipeline** - Claude structured output scoring across 4 dimensions with strengths, red flags, and hire recommendation; optionally mapped to interview pack questions if a pack exists
5. **Analysis Display** - Score card on candidate profile showing dimension scores, reasoning, strengths, red flags, and recommended decision alongside existing CV scores

## Out of Scope

- Zoom, Teams, or Google Meet OAuth API integration (direct pull from platform) — manual upload first
- Real-time meeting bot or audio transcription (import only)
- Slack integration (transcript exports too limited/non-existent)
- Gemini model option for transcript scoring (Claude only in MVP)
- Transcript editing or annotation in-app

## Expected Deliverable

1. Recruiter can upload a `.vtt`, `.srt`, `.docx`, or `.txt` transcript file on a candidate profile page and receive AI-generated scores within 60 seconds
2. Recruiter can paste raw transcript text as an alternative to file upload with identical output
3. Candidate profile page shows the interview analysis (dimension scores, summary, strengths, red flags, recommendation) alongside the existing CV score card
4. All transcript data is scoped to the tenant (RLS enforced) and inaccessible to `viewer` role users

## Spec Documentation

- Tasks: @.agent-os/specs/2026-04-10-interview-transcript-scoring/tasks.md
- Technical Specification: @.agent-os/specs/2026-04-10-interview-transcript-scoring/sub-specs/technical-spec.md
- API Specification: @.agent-os/specs/2026-04-10-interview-transcript-scoring/sub-specs/api-spec.md
- Database Schema: @.agent-os/specs/2026-04-10-interview-transcript-scoring/sub-specs/database-schema.md
- Tests Specification: @.agent-os/specs/2026-04-10-interview-transcript-scoring/sub-specs/tests.md
