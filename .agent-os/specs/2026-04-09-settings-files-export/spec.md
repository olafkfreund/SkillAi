# Spec Requirements Document

> Spec: Settings, Extended File Formats & PDF Export
> Created: 2026-04-09
> Status: Planning

## Overview

Three related infrastructure features: (1) a Settings panel where admins configure API keys (Claude + Gemini) per tenant without touching environment files; (2) extended CV upload support beyond PDF/DOCX to include ODT, TXT, RTF, and more; (3) PDF export/download of key artefacts (candidate shortlists, role descriptions, interview packs) so recruiters can share clean documents externally.

## User Stories

### Admin Configures API Keys in the UI

As an admin, I want to enter and save my Anthropic and Google API keys in a Settings panel in the portal, so that the team can start using AI features without me needing to restart Docker or edit environment files.

The admin clicks "Settings" in the sidebar, navigates to "Integrations", enters the Claude API key and optionally the Gemini API key, and clicks Save. Keys are stored encrypted in the database and used for all subsequent AI calls for that tenant.

### Recruiter Uploads an ODT or RTF CV

As a recruiter, I want to upload CVs in any common document format — including ODT (LibreOffice), RTF, or plain TXT — so that candidates who send their CV in non-standard formats are not excluded from the tool.

The recruiter drags a `.odt` file onto the upload zone and it is accepted, parsed for text, and processed identically to a PDF or DOCX.

### Recruiter Downloads a PDF of the Interview Pack

As a recruiter, I want to click "Download PDF" on an interview pack page and get a clean, formatted PDF of the interview questions, rubrics, and code challenge, so that I can hand it to a hiring manager who doesn't use the portal.

The recruiter clicks "Download PDF" on any interview pack, candidate shortlist, or role description page. A clean PDF is generated server-side and downloaded immediately.

## Spec Scope

1. **Settings panel** — Sidebar "Settings" link → settings page with "Integrations" tab; admin-only; saves `ANTHROPIC_API_KEY` and `GOOGLE_API_KEY` per tenant encrypted in DB; `NEXTAUTH_SECRET` used as encryption key; AI functions fall back to environment variable if DB key not set
2. **Extended CV parsers** — Support `.odt` (via `odt2txt` or `libreoffice --headless`), `.rtf` (via `rtf-parser` npm), `.txt` (native readFile), `.md` (native readFile); update dropzone accept list; update file_type enum in DB
3. **PDF export** — Server-side PDF generation using `@react-pdf/renderer`; exportable artefacts: (a) candidate shortlist table, (b) single candidate profile with scores, (c) role description, (d) interview pack with all questions + code challenge; download via `GET /api/export/[type]/[id]` route returning `application/pdf`

## Out of Scope

- `.pptx`, `.xls`, image-based CVs (require OCR — Phase 2)
- Bulk PDF export (zip of multiple files)
- White-label PDF branding / custom logo upload
- OAuth2-based API key configuration (Clerk, Google OAuth)
- Key rotation or expiry management
- Gemini model toggle in AI scoring (Gemini key stored but Claude remains primary in Phase 1)

## Expected Deliverable

1. Admin can enter a Claude API key in Settings → Integrations and have it immediately used for the next AI scoring run (without restarting Docker)
2. Uploading a `.odt` or `.rtf` CV file succeeds — candidate record is created with extracted text visible on profile page
3. Clicking "Download PDF" on an interview pack downloads a clean multi-page PDF with all questions, rubrics, and code challenge formatted for printing

## Spec Documentation

- Tasks: @.agent-os/specs/2026-04-09-settings-files-export/tasks.md
- Technical Specification: @.agent-os/specs/2026-04-09-settings-files-export/sub-specs/technical-spec.md
- Database Schema: @.agent-os/specs/2026-04-09-settings-files-export/sub-specs/database-schema.md
- API Specification: @.agent-os/specs/2026-04-09-settings-files-export/sub-specs/api-spec.md
- Tests Specification: @.agent-os/specs/2026-04-09-settings-files-export/sub-specs/tests.md
