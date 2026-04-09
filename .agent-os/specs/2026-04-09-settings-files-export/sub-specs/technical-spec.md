# Technical Specification

This is the technical specification for the spec detailed in @.agent-os/specs/2026-04-09-settings-files-export/spec.md

> Created: 2026-04-09
> Version: 1.0.0

## Feature 1: Settings Panel & API Key Management

### Encryption Strategy

API keys are sensitive — stored encrypted at rest, never returned in plaintext to the client.

**Algorithm:** AES-256-GCM (Node.js `crypto` module — no extra dependency)
**Key derivation:** `NEXTAUTH_SECRET` (already required, 32-byte base64) → derived via `scrypt` to 32-byte AES key
**Storage:** `tenant_settings` table, `value` column stores `iv:authTag:encryptedHex` string

```typescript
// src/lib/crypto.ts
import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from 'crypto'

const deriveKey = () => scryptSync(process.env.NEXTAUTH_SECRET!, 'skillai-salt', 32)

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decrypt(stored: string): string {
  const [ivHex, tagHex, encHex] = stored.split(':')
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(), Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return decipher.update(Buffer.from(encHex, 'hex')).toString('utf8') + decipher.final('utf8')
}
```

### API Key Resolution

All AI functions use a `resolveApiKey(tenantId, provider)` helper:

```typescript
// src/lib/ai/keys.ts
export async function resolveAnthropicKey(tenantId: string): Promise<string> {
  const setting = await getTenantSetting(tenantId, 'anthropic_api_key')
  if (setting) return decrypt(setting.value)
  return process.env.ANTHROPIC_API_KEY! // fallback to env
}
```

### Settings UI

- **Location:** `src/app/(dashboard)/settings/page.tsx`
- **Tabs:** "Integrations" (API keys) | "Account" (future: password change)
- **Integrations tab:** Two `<ApiKeyField />` components — one for Claude, one for Gemini
- **`<ApiKeyField />`:** Shows masked value (`sk-ant-••••••••••••••••••••••`) if key is saved; "Edit" button reveals input; "Save" calls server action; "Remove" clears value
- **Admin only:** Middleware blocks non-admin access to `/settings`

---

## Feature 2: Extended CV File Formats

### Supported Formats (Phase 1)

| Format | Extension | Parser | Notes |
|---|---|---|---|
| PDF | `.pdf` | `pdf-parse` | Existing |
| Word | `.docx` | `mammoth` | Existing |
| OpenDocument Text | `.odt` | `node-odt` or exec `unoconv` | Text extraction via npm or headless LibreOffice |
| Rich Text Format | `.rtf` | `rtf-parser` (npm) | Plain text extraction |
| Plain Text | `.txt` | `fs.readFile` (utf-8) | Direct read |
| Markdown | `.md` | `fs.readFile` (utf-8) | Direct read, strip `#` headers |

**ODT decision:** `node-odt` is a pure-JS npm package for ODT parsing — preferred over `unoconv` (which requires LibreOffice installed in Docker image, adding 500MB). Fallback: if `node-odt` output is empty, log warning and treat as unsupported.

### Parser Module

```typescript
// src/lib/parsers/index.ts
export async function parseFile(buffer: Buffer, fileType: FileType): Promise<string> {
  switch (fileType) {
    case 'pdf':  return parsePdf(buffer)
    case 'docx': return parseDocx(buffer)
    case 'odt':  return parseOdt(buffer)
    case 'rtf':  return parseRtf(buffer)
    case 'txt':
    case 'md':   return buffer.toString('utf-8')
    default:     throw new ParseError(`Unsupported file type: ${fileType}`)
  }
}
```

### DB Change

`candidates.file_type` enum extended: `CHECK (file_type IN ('pdf', 'docx', 'odt', 'rtf', 'txt', 'md'))`

Migration: `ALTER TABLE candidates DROP CONSTRAINT candidates_file_type_check; ALTER TABLE candidates ADD CONSTRAINT candidates_file_type_check CHECK (file_type IN ('pdf', 'docx', 'odt', 'rtf', 'txt', 'md'));`

### Dropzone Accept Update

```typescript
accept: {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.oasis.opendocument.text': ['.odt'],
  'application/rtf': ['.rtf'],
  'text/plain': ['.txt', '.md'],
}
```

---

## Feature 3: PDF Export

### Library Choice: `@react-pdf/renderer`

Renders React components to PDF server-side. Runs in Node.js (no browser required). No external binary dependencies (unlike Puppeteer which requires Chromium). Output is clean, printable PDF.

### Export Types & Routes

| Export | Route | Renders |
|---|---|---|
| Candidate shortlist | `GET /api/export/shortlist/[roleId]` | Ranked table with scores |
| Candidate profile | `GET /api/export/candidate/[scoreId]` | Profile + dimension scores + summary |
| Role description | `GET /api/export/role/[roleId]` | Title, description, requirements |
| Interview pack | `GET /api/export/interview-pack/[packId]` | All questions + rubrics + code challenge |

### PDF Components (`src/lib/pdf/`)

```
src/lib/pdf/
├── index.ts                  # renderToPdf(component) → Buffer
├── styles.ts                 # Shared StyleSheet (fonts, colors, spacing)
├── shortlist-pdf.tsx         # <ShortlistDocument /> React-PDF component
├── candidate-pdf.tsx         # <CandidateDocument />
├── role-pdf.tsx              # <RoleDocument />
└── interview-pack-pdf.tsx    # <InterviewPackDocument />
```

### Response Pattern

```typescript
// All export routes return:
const pdfBuffer = await renderToPdf(<InterviewPackDocument pack={pack} />)
return new Response(pdfBuffer, {
  headers: {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${sanitizedName}.pdf"`,
  },
})
```

### UI Integration

Each exportable page gets a "Download PDF" button:
- Candidate profile page → links to `/api/export/candidate/[scoreId]`
- Role detail page → links to `/api/export/role/[roleId]` + `/api/export/shortlist/[roleId]`
- Interview pack page → links to `/api/export/interview-pack/[packId]`

Button uses `<a href="/api/export/..." download>` — no client-side JavaScript needed.

## New Dependencies

| Package | Purpose |
|---|---|
| `@react-pdf/renderer` | Server-side PDF generation |
| `node-odt` | ODT file text extraction |
| `rtf-parser` | RTF file text extraction |
