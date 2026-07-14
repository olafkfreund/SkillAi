---
title: "Tips for getting better rankings out of the AI"
category: "Tips & Best Practice"
audience: ["recruiter", "admin"]
order: 10
lastUpdated: "2026-04-28"
tags: ["tips", "scoring", "rankings", "best-practice"]
---

# Tips for getting better rankings out of the AI

The scoring engine is good at the work it can do, and confused by inputs that humans would also struggle with. The difference between a useful ranking and a noisy one is mostly in what you feed it.

## Write the role description like you'd brief a senior recruiter

Don't drop in the customer's marketing-flavoured job advert. Strip it down. The AI scores against what's in the role description, so:

- **List the must-have skills explicitly.** "PostgreSQL, Python, Kubernetes" beats "modern data stack experience".
- **Give a years-of-experience band.** "5–8 years" anchors the experience-level dimension. Without one the AI guesses.
- **Name the seniority** — "Senior", "Lead", "Principal" — and back it up with concrete responsibilities ("owns architectural decisions for the platform team").
- **Include domain context** if it matters. "Fintech KYC platform" filters differently to "consumer mobile app" even if the tech stack overlaps.

A 250-word focused role description outranks a 2,000-word marketing brochure every time.

## Use the customer framework if you have one

If the role belongs to a customer with [hiring framework levels](/dashboard/help/customers-and-frameworks), pick the level. The AI is told the customer's own definition of seniority, which produces sharper rankings than a generic seniority guess.

## Set the budget if you know it

Adding a `customerDayRate` (the budget) and per-candidate `candidateRate` lets the AI mention budget alignment in its summary — without affecting the four scored dimensions. Strong candidates over budget aren't penalised; the AI just notes "may require negotiation" or "may be misaligned with seniority" depending on the gap. See decision DEC-009 for the rationale.

> Currency mismatch (role in EUR, candidate in GBP) **suppresses** the budget signal — the UI still shows the margin pill with a warning, but the AI isn't asked to reason across currencies.

## Run scoring after the CV is clean

If the uploaded CV is a 30-page consultancy template with images and tables, run **Reformat CV** before you score. The reformat pass cleans the extracted text into structured markdown, which gives the scoring pass a cleaner signal. Garbage in, garbage out.

## Re-rank when context changes

Scores aren't immutable truths — they're a function of (candidate, role) at a point in time. Re-rank a candidate when:

- You've edited the role description significantly.
- You've changed the customer's framework level.
- You've switched the AI model from Claude to Gemini (or back).
- The candidate's CV has been updated.

The re-rank button on the candidate detail page kicks off a fresh score. Old scores are kept in the history.

## Read the reasoning, not just the number

Two candidates can both score 78 overall and be wildly different — one strong on skills and weak on communication, another the opposite. Open both, expand the per-dimension reasoning. The reasoning is also where the AI flags edge cases ("CV mentions Python but no concrete projects", "experience level inferred from job titles, not stated explicitly") that pure numbers hide.

## Compare Claude vs Gemini

The model toggle (per-tenant, in settings) lets you switch the scoring engine. Claude (`claude-sonnet-4-6`) is the default and produces the most consistent rankings; Gemini (`gemini-3.5-flash`) is faster and cheaper for bulk runs. If you're unsure about a particular candidate, run them through both — disagreement is itself a signal.

## Don't fight the four dimensions

The dimensions are technical_skills, experience_level, cultural_fit, and communication. They're deliberately broad. Don't try to hack a fifth dimension into the role description ("score them on UK-only experience"). It won't work cleanly. Use the role description to shape what each dimension means **in this context** instead.

Related: [How AI scoring works](/dashboard/help/ai-how-scoring-works), [Roles: creating and editing](/dashboard/help/roles-creating-and-editing).
