# API Specification

This is the API specification for the spec detailed in @.agent-os/specs/2026-04-09-settings-files-export/spec.md

> Created: 2026-04-09
> Version: 1.0.0

## Server Actions

### `saveApiKey(formData: FormData)`

**File:** `src/actions/settings.ts`
**Auth:** admin only
**Purpose:** Encrypt and upsert an API key for the current tenant

**Input:**
- `provider` — `'anthropic' | 'google'`
- `apiKey` — string, min 10 chars

**Behaviour:**
1. Validate inputs (Zod)
2. Check caller has `admin` role
3. Encrypt `apiKey` with AES-256-GCM using `NEXTAUTH_SECRET`
4. Upsert into `tenant_settings`: key = `anthropic_api_key` or `google_api_key`
5. `revalidatePath('/settings')`
6. Return `{ success: true }` — never return the key or encrypted value

---

### `removeApiKey(provider: 'anthropic' | 'google')`

**File:** `src/actions/settings.ts`
**Auth:** admin only
**Purpose:** Delete a stored API key (fall back to env var)

**Behaviour:**
1. Delete row from `tenant_settings` where `key = '{provider}_api_key'`
2. `revalidatePath('/settings')`

---

## API Routes — PDF Export

All export routes return `application/pdf`. Auth required (all roles). Tenant isolation enforced — cross-tenant IDs return 404.

### `GET /api/export/shortlist/[roleId]`

**Purpose:** Ranked candidate list for a role as PDF
**Filename:** `{roleTitle}-shortlist.pdf`
**Content:** Table of all scored candidates sorted by `overall_score DESC`, with name, agency, overall score, dimension scores. Page header: role title + generated date. Footer: page numbers.

**Query params:**
- `minScore` (optional, int) — filter to candidates above threshold (same params as candidate list API)

---

### `GET /api/export/candidate/[candidateId]`

**Purpose:** Single candidate profile as PDF
**Query params:** `roleId` (required) — selects which score to include
**Filename:** `{candidateName}-profile.pdf`
**Content:** Candidate name/email/agency, score summary bar (4 dimensions), per-dimension reasoning, CV text (truncated to 2 pages if very long), AI summary. Generated date + role title in header.

---

### `GET /api/export/role/[roleId]`

**Purpose:** Role description as clean PDF document
**Filename:** `{roleTitle}-description.pdf`
**Content:** Role title, description prose, requirements list, created date, tenant name.

---

### `GET /api/export/interview-pack/[packId]`

**Purpose:** Full interview pack as PDF
**Filename:** `{candidateName}-interview-pack.pdf`
**Content:**
- Cover page: candidate name, role title, experience level, recommended duration, generated date
- Questions section: each question on its own block with type/difficulty badges, scoring rubric (strong / acceptable / weak), follow-up questions
- Code challenge section (if present): problem description, starter code block, unit tests block, evaluation criteria
- Footer: page numbers, "Confidential — Internal Use Only"

---

## Settings Routes

### `GET /api/settings/integrations`

**File:** `src/app/api/settings/integrations/route.ts`
**Auth:** admin only
**Purpose:** Check which API keys are configured (without revealing values)

**Response `200`:**
```json
{
  "anthropic": { "configured": true, "maskedKey": "sk-ant-••••••1234" },
  "google": { "configured": false, "maskedKey": null }
}
```

**Masking:** Show last 4 characters only — decrypt to get last 4 chars, then mask rest with `•`.

---

## Role Permissions

| Action | admin | recruiter | viewer |
|---|---|---|---|
| View settings page | ✓ | ✗ | ✗ |
| Save/remove API key | ✓ | ✗ | ✗ |
| Download any PDF export | ✓ | ✓ | ✓ |
| Upload ODT/RTF files | ✓ | ✓ | ✗ |
