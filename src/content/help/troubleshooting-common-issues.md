---
title: "Troubleshooting: when things don't work"
category: "Troubleshooting"
audience: ["all"]
order: 90
lastUpdated: "2026-04-28"
tags: ["troubleshooting", "errors", "debugging", "fixes"]
---

# Troubleshooting: when things don't work

A field-guide to the things that go wrong most often. Each section follows the same pattern: **symptom → likely cause → fix**.

If none of these match, message your admin with the candidate ID, role ID and the time the problem happened — that's enough to find the root cause in the audit log.

## My CV won't parse

**Symptom:** You upload a CV, the candidate is created, but the parsed text is empty or garbled. The candidate detail page shows a "parse failed" pill, or the AI score is wildly off because it had nothing to read.

**Likely causes:**

- The PDF is a **scanned image**, not a text-layer PDF. SkillAI does not OCR.
- The file is **password-protected** or DRM'd.
- The file is an old **`.doc` (not `.docx`)**, which is unsupported.
- The file is corrupted (truncated download).

**Fix:**

- Open the original in Word, LibreOffice or Acrobat and re-save as PDF or DOCX.
- For scanned PDFs, run them through an OCR tool (Acrobat, ABBYY) and re-upload.
- For password-protected PDFs, ask the agency to send an unlocked copy.
- Quick fallback: paste the CV text into a `.txt` or `.md` file and upload that — text formats always parse cleanly.
- Use the **Reformat CV** button on the candidate detail page if extraction worked but the result is messy — the AI runs a cleanup pass.

## AI scoring returns 0 / fails

**Symptom:** The candidate is uploaded but the score never lands, or you see "score failed — retry".

**Likely causes:**

- No AI API key is configured for your tenant.
- The configured API key is invalid, expired or out of credits.
- Rate limit hit (mostly seen in bulk uploads of 100+ CVs).
- The CV parse was empty — see the previous section.
- A network blip between SkillAI and the model provider.

**Fix:**

- Admin: open **Settings → AI** and verify the Claude (and/or Gemini) key is present and valid. See [Settings: API keys](/dashboard/help/settings-api-keys).
- Click **Rescore** on the candidate card. Most failures are transient and one retry succeeds.
- For bulk-upload failures, wait 30 seconds and rescore the failed batch. Rate limits reset quickly.
- If every score fails after a config change, the key is probably wrong. Re-paste it — copy/paste sometimes adds whitespace.

## Score seems wrong for this candidate

**Symptom:** You read the CV. The candidate is clearly a strong fit. The AI gave them 52.

**Likely causes:**

- The role description is **vague or generic**. The AI scores against the JD it was given, not the JD in your head.
- The CV is **poorly formatted**, so extraction missed critical sections.
- The candidate has the right skills under different names ("React Native" instead of "mobile"), and the JD didn't make the connection clear.
- Genuine model error — happens.

**Fix:**

- Read the per-dimension reasoning. Click each dimension to expand. The AI usually tells you exactly which signal was missing.
- Edit the role description to be more specific about must-haves and nice-to-haves. See [Tips for getting better rankings](/dashboard/help/tips-getting-better-rankings).
- Click **Rescore** — sometimes the second run is materially different, especially after editing the JD.
- If a single score is genuinely wrong, override with your judgement. Move the candidate to `shortlisted` regardless of the number. Recruiters are the judgement layer; AI is the assistant.

## PDF export hangs

**Symptom:** You click **Export PDF** on a role brief, candidate profile or shortlist. Spinner goes forever.

**Likely causes:**

- Server-side rendering is queued behind a slower job.
- The thing being exported is huge (a shortlist with 60 candidates, each with multi-page CVs).
- A transient render error.

**Fix:**

- Wait a full minute before assuming it's stuck. Large shortlists genuinely take 30–60 seconds.
- If still nothing, refresh the page and try again — the second attempt usually succeeds.
- For huge shortlists, export in two halves: filter to top-30 first, export, then bottom-30.
- Persistent failures across multiple exports are a server-side issue — admin should check logs.

## Can't see a role I expected

**Symptom:** You know a role exists. It's not on the **Roles** list.

**Likely causes:**

- It's **archived**. Archived roles are hidden by default.
- It belongs to a **different customer** and you have a customer filter active.
- Your role is **`viewer`** and you're looking at a private role you weren't given access to. (Unusual; most tenants don't restrict per-role.)
- You're in the wrong tenant (very rare; would need an admin who manages multiple).

**Fix:**

- Toggle the **Show archived** switch at the top of the roles list.
- Clear active filters — there's a **Clear all** button.
- Ask an admin to confirm the role's tenant and access settings.

## Bulk upload silently dropped a file

**Symptom:** You drop 50 CVs into the bulk uploader. Only 47 appear in the queue.

**Likely cause:** The dropzone silently skips files it doesn't recognise. The dropped folder probably contained a `.zip`, `.doc`, image, README or `.DS_Store`.

**Fix:**

- Check the source folder. Filter to only the supported formats: `.pdf`, `.docx`, `.odt`, `.rtf`, `.txt`, `.md`.
- Re-drop the missing files individually so you can see the rejection message ("unsupported file type" or "over 10 MB").
- For `.doc` files, batch-convert to `.docx` in Word or LibreOffice first.
- See [Uploading CVs](/dashboard/help/candidates-uploading-cvs) for the full format list.

## Still stuck?

- Check **Settings → Activity log** (admins) to see what actually happened on the server side.
- Note the candidate or role ID and a rough timestamp, then ask your admin. Both are visible in the URL of the page you were on when it broke.
