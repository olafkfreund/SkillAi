---
title: "Uploading CVs (single + bulk)"
category: "Roles & Candidates"
audience: ["recruiter", "admin"]
order: 11
lastUpdated: "2026-04-28"
tags: ["cv", "upload", "bulk", "file-formats"]
---

# Uploading CVs (single + bulk)

The fastest way to feed candidates into SkillAI is by dropping CVs into the upload zone. Both single and bulk uploads work the same way under the hood: the file is parsed, candidate metadata is extracted, and (if you uploaded against a role) AI scoring kicks off automatically.

## Supported formats

| Format | Extension | Notes |
|---|---|---|
| PDF | `.pdf` | Most reliable. Text-layer PDFs only — scanned/image PDFs won't extract. |
| Word | `.docx` | Microsoft Word, modern format. |
| OpenDocument | `.odt` | LibreOffice / OpenOffice. |
| Rich Text | `.rtf` | Yes, this still exists in 2026. |
| Plain text | `.txt` | Useful for paste-from-LinkedIn snippets. |
| Markdown | `.md` | If candidates send you their CV as markdown, you're hiring well. |

**Maximum size: 10 MB per file.** Anything larger is rejected at the dropzone.

> **Old `.doc` files are not supported.** Open them in Word or LibreOffice, save as `.docx`, then upload.

## Single upload

From any role detail page, click **Upload CV** (or use the candidate-only flow from **Candidates → Upload**).

1. Drag the file into the dropzone, or click to browse.
2. The dropzone shows the filename and size, then turns green when upload completes.
3. The candidate is parsed in the background. Within a few seconds, the candidate appears in the role's ranked list with a spinner while AI scoring runs.

You can fill in optional fields before or after upload: agency, candidate day rate, availability, languages spoken. None of these are mandatory — the AI works from the CV text alone if you skip them.

## Bulk upload

For high-volume situations (50+ CVs from an agency batch), use bulk upload:

1. From the role detail page, open **Bulk upload candidates**.
2. Drag a whole folder of CVs into the dropzone, or click to multi-select.
3. Files appear as a queue. Each one shows a status icon: queued, uploading, done, or error.
4. Click **Upload all** — files are processed sequentially.
5. When the run finishes, you'll see a summary: `N uploaded, M failed`. Click any failed item to see why.

Common failure causes for bulk:

- **Unsupported file type.** The dropzone silently skips files it doesn't recognise — check your folder for stray `.zip`, `.doc`, or image files.
- **File over 10 MB.** Usually means a CV with embedded images. Compress and re-upload, or convert to a smaller format.
- **Parse failure.** The file is corrupted, password-protected, or a scan with no text layer. The candidate is still created with empty extracted text; you'll see a "parse failed" pill on the candidate detail page and you can re-upload a better copy.

If a candidate already exists in your archive (matched on email or name + agency), bulk upload links the new CV to the existing record rather than creating a duplicate. Duplicate detection is fuzzy, not exact — review carefully if you bulk-upload from the same source twice.

## After upload

- Visit the role detail page to see the ranked list.
- Click any candidate to open their detail page, where you can read the parsed text, review scores, add notes, schedule interviews and generate interview packs.
- Need to fix mangled extraction? On the candidate detail page, **Reformat CV** runs a quick AI cleanup pass that turns ugly extracted text into structured markdown.

## See also

- [Candidate statuses and the bench](/dashboard/help/candidates-statuses-and-bench)
- [The candidate archive and semantic search](/dashboard/help/candidates-archive-and-search)
- [Bulk workflow tips](/dashboard/help/tips-bulk-workflow)
- [Troubleshooting common issues](/dashboard/help/troubleshooting-common-issues)
