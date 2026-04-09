# Spec Requirements Document

> Spec: Interview Question & Code Test Generator
> Created: 2026-04-09
> Status: Planning

## Overview

Build an AI-powered interview pack generator that takes a candidate's CV and a job role description and produces a personalised set of interview questions with scoring rubrics, follow-up prompts, and optional technical code challenges — giving recruiters and hiring managers a ready-to-use interview guide in seconds.

## User Stories

### Recruiter Generates an Interview Pack

As a recruiter, I want to click "Generate Interview Pack" on any scored candidate's profile page and receive a tailored set of interview questions within 15 seconds, so that I can hand a structured, personalised interview guide to the hiring manager without spending an hour writing questions manually.

The recruiter opens a candidate profile, selects the target role, and clicks "Generate Interview Pack". Claude analyses the CV against the role, identifies key projects and skills, and produces 8-12 questions across four categories (behavioral, technical, situational, cultural), each with expected answer signals and a scoring rubric. The pack is saved and viewable at any time.

### Hiring Manager Reviews and Runs the Interview

As a hiring manager, I want to open an interview pack and work through it question by question during the interview, with follow-up suggestions visible on demand, so that I run a consistent, fair, and thorough interview without improvising.

The hiring manager opens the pack, sees questions grouped by category, can expand any question to read the scoring rubric and suggested follow-ups, and can add notes per question during or after the interview.

### Recruiter Requests a Technical Code Test

As a recruiter, I want to generate a role-appropriate coding challenge tailored to the candidate's apparent skill level (inferred from their CV), so that technical candidates receive a relevant, proportionate test instead of a generic LeetCode puzzle.

The recruiter ticks "Include code challenge" when generating a pack. Claude generates a domain-specific coding challenge with a problem description, starter code (function signatures), and 3-4 unit tests, calibrated to the candidate's experience level.

## Spec Scope

1. **Interview Pack generation** — Claude two-stage pipeline: CV parsing into structured fields → personalised question generation using competency framework; stored as `interview_packs` + `interview_questions` records
2. **Question categories** — Four types generated per pack: behavioral (40%), technical (35%), situational (15%), cultural (10%); 8-12 questions total
3. **Personalisation** — Questions explicitly reference the candidate's CV projects, companies, and technologies where relevant; `personalization_level` field indicates specificity
4. **Scoring rubrics + follow-ups** — Each question includes expected answer signals (strong/acceptable/weak indicators) and 1-2 conditional follow-up questions
5. **Technical code challenge** — Optional; generates problem description + starter code + 3-4 unit tests calibrated to candidate experience level (junior/mid/senior inferred from CV)
6. **Interview pack UI** — Dedicated page per pack; questions grouped by category; expandable rubric/follow-up per question; per-question notes field; printable view
7. **Pack management** — List of all packs per candidate; regenerate pack; delete pack

## Out of Scope

- Real-time interview AI assistant (live transcription, in-meeting copilot)
- Video recording or screening integration
- Automated candidate scoring based on interview answers
- Email/calendar integration for scheduling interviews
- Multi-language question generation (English only in Phase 1)
- Custom competency framework editor (fixed 5 competencies per role type)

## Expected Deliverable

1. From a scored candidate's profile, clicking "Generate Interview Pack" produces a saved pack with 8-12 personalised questions visible on a dedicated page within 20 seconds
2. Each question shows: question text, type badge, difficulty, scoring rubric (expandable), and 1-2 follow-ups; at least 3 questions explicitly reference the candidate's CV content
3. Enabling "Include code challenge" produces a code block with problem description, starter code, and unit tests appropriate to the candidate's inferred experience level

## Spec Documentation

- Tasks: @.agent-os/specs/2026-04-09-interview-question-generator/tasks.md
- Technical Specification: @.agent-os/specs/2026-04-09-interview-question-generator/sub-specs/technical-spec.md
- Database Schema: @.agent-os/specs/2026-04-09-interview-question-generator/sub-specs/database-schema.md
- API Specification: @.agent-os/specs/2026-04-09-interview-question-generator/sub-specs/api-spec.md
- Tests Specification: @.agent-os/specs/2026-04-09-interview-question-generator/sub-specs/tests.md
