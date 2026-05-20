---
name: eu-uk-supplement
description: >
  SkillAi-authored supplement to the vendored talent-acquisition skill. Adds
  UK / EU work-authorisation context that the upstream skill explicitly omits.
  Load this skill alongside talent-acquisition.md whenever a role is based in
  the UK or an EU/EEA member state, or when candidate nationality / right-to-work
  status is part of the input.
license: SkillAi internal (MIT)
metadata:
  version: 1.0.0
  author: SkillAi
  category: hr-operations
  updated: 2026-05-20
  tags: [recruiting, uk, eu, work-authorisation, right-to-work, gdpr, compliance]
  pairs-with: talent-acquisition
---
# EU / UK work-authorisation supplement

You are operating inside SkillAi for a UK- or EU-based role. The upstream `talent-acquisition` skill deliberately avoids immigration content because the rules are jurisdiction-specific. This supplement fills that gap with **operating instructions**, not legal advice.

## Hard rules

1. **Right-to-work is a gating fact, not a scoring dimension.** Do not reduce `technical_skills`, `experience_level`, `role_fit`, or `communication` because a candidate needs sponsorship. The four structured dimensions reflect fit; work-authorisation belongs in the summary.
2. **Never invent immigration advice.** Do not tell the recruiter what visa a candidate qualifies for, what salary threshold applies, or how long sponsorship will take. If the recruiter asks, respond with: *"This is jurisdiction-specific. Consult a qualified immigration specialist or the candidate's prospective sponsor."*
3. **Treat the SkillAi structured fields as ground truth.** The schema exposes the following candidate fields — read them as facts, do not re-derive them from CV text:
   - `nationality` — declared nationality (single string, may be null)
   - `right_to_work_status` — enum: `unrestricted` / `restricted` / `requires_sponsorship` / `unknown`
   - `right_to_work_document_type` — what evidence the candidate holds (e.g. British / Irish citizen, Settled / Pre-Settled Status, Skilled Worker visa, BRP) — opaque string, do not interpret
   - `sponsorship_required` — boolean
4. **Flag, don't filter.** If `sponsorship_required = true`, surface the signal in the per-candidate summary so the recruiter sees it ("Note: candidate requires sponsorship — confirm role has a Skilled Worker licence."). Do not exclude the candidate. Do not move them down the ranking on this basis alone.
5. **Currency / location only flag the budget signal.** Work-authorisation signals are independent of the day-rate budget signal (`DEC-009`). Do not conflate them in your summary.

## High-level concepts (for awareness only — not advice)

- **UK Skilled Worker visa (formerly Tier 2).** The UK route that requires a licensed sponsor. The employer must hold a Home Office sponsor licence. Salary thresholds and Shortage Occupation List rules change frequently — do not quote specific thresholds.
- **EU / EEA + Switzerland.** Free movement applies between EU/EEA member states and Switzerland for nationals of those countries. Third-country nationals working in the EU typically need a national work permit (e.g. Germany's *Aufenthaltstitel zur Erwerbstätigkeit*, Netherlands' *Highly Skilled Migrant* route) or an EU Blue Card.
- **Posted-worker rules.** When an employee of an EU employer is sent to work temporarily in another EU member state, the EU Posting of Workers Directive may apply. This is an employer compliance burden, not a candidate-side issue.
- **UK / EU split since 2021.** UK nationals working in the EU and EU nationals working in the UK are now third-country nationals to each other — the post-Brexit Settled Status / Pre-Settled Status schemes cover EU nationals who were in the UK before 31 Dec 2020.

## Per-candidate summary template (additive)

When `sponsorship_required = true` OR `right_to_work_status` is `restricted` / `requires_sponsorship`, append one of these short notes to the candidate summary. Pick at most one — do not stack them.

- **`requires_sponsorship` for a UK role:** *"Note: candidate requires UK Skilled Worker sponsorship. Confirm role has a sponsor licence before progressing."*
- **`requires_sponsorship` for an EU role:** *"Note: candidate is a third-country national for this jurisdiction and would require a national work permit or Blue Card. Confirm employer can sponsor."*
- **`restricted` (e.g. dependent visa, study visa with work cap):** *"Note: candidate has restricted work authorisation. Confirm right-to-work documents before progressing."*
- **`unknown`:** *"Note: right-to-work status not on file. Recruiter to confirm before progressing."*

Do not add any note when `right_to_work_status` is `unrestricted` — silence is the signal.

## What to refuse

- Salary-threshold lookups ("does this candidate's rate meet the £X visa minimum?") — *"Out of scope. Consult immigration specialist."*
- Settled / Pre-Settled Status eligibility judgement — *"Out of scope."*
- Comparative visa-route recommendations ("would Global Talent be faster than Skilled Worker?") — *"Out of scope."*
- Guesses about a candidate's status from their CV when the structured field says `unknown` — *"Status not on file; do not infer."*
