# Tests Specification

This is the tests coverage for the spec detailed in @.agent-os/specs/2026-04-09-settings-files-export/spec.md

> Created: 2026-04-09
> Version: 1.0.0

## Unit Tests

### `src/lib/crypto.ts`
- `encrypt()` + `decrypt()` roundtrip: `decrypt(encrypt(secret)) === secret`
- `encrypt()` produces different ciphertext on each call (random IV)
- `decrypt()` with tampered authTag throws `Error`
- `decrypt()` with wrong IV throws `Error`

### `src/lib/parsers/index.ts` — extended formats
- `.odt` fixture file → returns non-empty string
- `.rtf` fixture file → returns non-empty string
- `.txt` file → returns exact file content as string
- `.md` file → returns file content as string
- Unknown extension `.xls` → throws `ParseError`

### `src/lib/ai/keys.ts` — `resolveAnthropicKey()`
- DB has key → returns decrypted key (mock DB + mock decrypt)
- DB has no key → returns `process.env.ANTHROPIC_API_KEY`
- Both missing → throws `Error('No Anthropic API key configured')`

## Integration Tests

### `saveApiKey` Server Action
- Admin saves Claude key → `tenant_settings` row upserted with encrypted value
- Re-saving with new key → existing row updated (not duplicated)
- Non-admin caller → returns permission error
- Key too short (< 10 chars) → Zod validation error
- Saving then removing → row deleted; `resolveAnthropicKey` falls back to env

### `GET /api/settings/integrations`
- Admin with saved key → `{ configured: true, maskedKey: 'sk-ant-••••1234' }`
- Admin with no key saved → `{ configured: false, maskedKey: null }`
- Non-admin request → 403

### CV Upload — Extended Formats (integration)
- Upload `.odt` fixture → candidate record created with non-empty `cv_text`
- Upload `.rtf` fixture → candidate record created
- Upload `.txt` fixture → candidate record created
- Upload `.xls` → 400 error response

### `GET /api/export/interview-pack/[packId]`
- Returns `Content-Type: application/pdf`
- Returns `Content-Disposition` with filename containing candidate name
- Cross-tenant packId → 404
- Pending pack (not complete) → 400 `{ error: 'Pack not ready' }`

### `GET /api/export/shortlist/[roleId]`
- Returns PDF with correct content-type
- `minScore=80` → only includes candidates with score ≥ 80 in PDF

## Component Tests

### `<ApiKeyField />`
- Shows "Not configured" state when no key saved
- Shows masked key `sk-ant-••••1234` when key is saved
- "Edit" button reveals input field
- "Save" button calls `saveApiKey` server action
- "Remove" button calls `removeApiKey` with confirmation dialog

### Settings page
- Accessible to admin → renders both API key fields
- `viewer` or `recruiter` role → redirected (middleware test)

### Download buttons
- `<a href="/api/export/..." download>` rendered on correct pages
- Interview pack page has download link pointing to correct packId
- Candidate profile page has download link with correct candidateId + roleId query param

## Test File Layout

```
tests/
├── unit/
│   ├── crypto.test.ts
│   ├── parsers/
│   │   ├── odt.test.ts
│   │   ├── rtf.test.ts
│   │   └── txt.test.ts
│   └── ai/
│       └── keys.test.ts
├── integration/
│   ├── actions/
│   │   └── saveApiKey.test.ts
│   └── api/
│       ├── settings-integrations.test.ts
│       ├── export-interview-pack.test.ts
│       └── export-shortlist.test.ts
├── components/
│   └── api-key-field.test.tsx
└── fixtures/
    ├── sample.odt
    ├── sample.rtf
    └── sample.txt
```
