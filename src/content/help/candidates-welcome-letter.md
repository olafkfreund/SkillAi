---
title: "Welcome letter PDF for candidates"
category: "Roles & Candidates"
audience: ["recruiter", "admin"]
order: 36
lastUpdated: "2026-05-01"
tags: ["candidate", "pdf", "welcome-letter", "ai", "multilingual"]
---

# Welcome letter PDF for candidates

The welcome letter is a one-page AI-generated PDF you can hand a candidate after they've been shortlisted for a role. It explains, in their preferred language, why they're a strong match — using their CV evidence formatted into STAR-style rows (Situation / Task / Action / Result).

It is **not** a generic email template. Each letter is regenerated against the specific candidate × role pairing and reflects the actual scoring run, including the AI's reasoning.

## When to use it

- You've shortlisted a candidate and want to set the right tone before the interview.
- You're sending the candidate to a customer (via the customer share-link flow) and want them to walk in primed about why they were chosen.
- The candidate's first language isn't the role's primary language and you want to write in theirs without manually translating.

## What's in the letter

- A short personal greeting using the candidate's first name.
- 3–4 STAR rows pulled from their CV, each tied to a competency the role explicitly asks for. The rows are stacked vertically (one per page-section) for easy scanning.
- A "Karat section" — a structured paragraph framing the candidate's overall fit story for this specific role.
- The agency / customer logos and your tenant branding in the header. Same logos as the candidate / role / shortlist PDFs use.

The letter never includes day rates, internal notes, margin, or anything from the recruiter-private side of the candidate record. It's safe to hand directly to the candidate.

## Generating one

1. Open the candidate detail page for the candidate.
2. The candidate must already have a score against at least one role — the letter is anchored to a specific scoring run.
3. Click **"Generate welcome letter"** and pick the target role (if the candidate is on multiple).
4. Pick the language (see below).
5. Wait ~10–20 seconds for the AI to compose and the PDF to render. Click-to-download when ready.

## Languages

Languages are picked per-letter, not per-candidate. The current supported set covers the core European languages your tenant is configured for in **Settings → Default Pack Language** plus the candidate's CV language if SkillAi can detect one.

If your candidate's CV is in Polish but the role is being interviewed in English, the AI can still write the letter in Polish — pick whichever language puts the candidate at ease. Score quality is unaffected by letter language; the letter is downstream of scoring.

## What does NOT get regenerated automatically

- **Editing the role's description** does not regenerate existing letters. If you change priority keywords or the role's `description` field after generating a letter, regenerate manually if you want the letter to reflect the new framing.
- **Re-scoring the candidate** does not regenerate the letter either. The letter caches the snapshot of reasoning that existed when it was generated.

This is intentional — recruiters often tweak the role description or re-run scoring multiple times, and silently rewriting downstream candidate-facing content would be unsafe.

## Cost note

Each letter is a Claude call against the candidate's full CV + the role's full description, plus a render pass. Cost shows up in the AI spend dashboard under the `welcome-letter` operation tag. Order-of-magnitude similar to a single scoring run.

## Related

- Sending a candidate to a customer: see "Sending candidates to a customer".
- Customer-facing PDF (separate doc): the candidate PDF available from the role detail's `Sent to customer` panel is a different artefact — it's the candidate's full sanitised profile, not the letter.
