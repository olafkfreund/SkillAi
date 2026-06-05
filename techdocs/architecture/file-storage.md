# File storage

_Where uploaded CVs and branding logos live, how paths are laid out, and the path-traversal guard._

SkillAI stores two kinds of binary files on disk: candidate CVs and tenant branding logos (agency + customer). Both live under the same uploads root, partitioned per tenant. For dev and small production deployments the uploads root is a Docker volume; for larger production deployments it is a Garage-backed S3 bucket.

## Layout

The on-disk layout under `UPLOAD_DIR` (default `/app/uploads`):

```
{UPLOAD_DIR}/
└── {tenantId}/
    ├── {uuid}.pdf          # CV files (PDF/DOCX/ODT/RTF/TXT/MD)
    ├── {uuid}.docx
    └── logos/
        ├── {uuid}.png      # PNG/JPEG/WebP only — no SVG
        └── {uuid}.webp
```

The DB stores **web-relative paths** with a leading slash:

- CVs: `/uploads/{tenantId}/{uuid}.{ext}` (in `candidates.cv_file_path`)
- Logos: `/uploads/{tenantId}/logos/{uuid}.{ext}` (in `agencies.logo_path` and `customers.logo_path`)

The leading slash is significant — these are the URLs the frontend uses to fetch the file, *and* the source of truth from which the absolute filesystem path is derived.

## The symmetry rule

> **⚠️ Caution**
>
> **The DB-stored path must be the canonical source for both write and read.** Compute it first, derive the absolute filesystem path from it. Never compute write and read paths independently from the same inputs.

Both `persistCvFile()` in `src/lib/cv/store.ts:150` and `persistLogo()` in `src/lib/branding/store.ts:88` follow this rule:

```typescript
// CORRECT — DB path first, absolute derived from it
const filePath = `/uploads/${tenantId}/${fileName}`
const absolutePath = join(process.cwd(), filePath.slice(1))
await mkdir(join(absolutePath, '..'), { recursive: true })
await writeFile(absolutePath, buffer)
return { filePath, fileId }
```

The matching reader (`deleteCvFile()`, `getLogoAbsolutePath()`) uses the same `process.cwd() + filePath.slice(1)` derivation. This is enforced by code review, not by the type system — adding a new write path is the moment to recheck.

The pattern exists because of issue #98, which broke logo serving when the write side used `UPLOAD_DIR` directly (an absolute path like `/app/app/uploads`) while the read side stripped the leading slash and joined with `cwd`. The two paths diverged silently; logos uploaded successfully but never served.

## CV files

Defined in `src/lib/cv/store.ts`. Key constraints:

- **Max size:** 10 MB (`MAX_FILE_SIZE`).
- **Accepted MIME types:** `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/vnd.oasis.opendocument.text`, `application/rtf`, `text/rtf`, `text/plain`, `text/markdown`.
- **Accepted extensions** (fallback when MIME is wrong/missing): `.pdf`, `.docx`, `.odt`, `.rtf`, `.txt`, `.md`.
- **Magic-byte check** via the `file-type` package — rejects executables or images renamed to a supported extension. Plain text and markdown have no reliable magic bytes, so `undefined` from `file-type` is allowed for those.
- **Storage path:** `/uploads/{tenantId}/{uuid}.{ext}` — UUID v4 filename, original filename is discarded (recorded in `candidates.original_filename` for download UX only).

`parseCvBuffer()` extracts plain text from the buffer using the format-specific parser, then strips null bytes and non-printable control characters that PostgreSQL rejects in `text` columns.

## Branding logos

Defined in `src/lib/branding/store.ts`. Tighter constraints than CVs:

- **Max size:** 2 MB (`MAX_LOGO_SIZE`).
- **Accepted MIME types:** `image/png`, `image/jpeg`, `image/webp` only. **SVG is rejected** because inline `<svg>` rendering has an XSS surface (`<script>` blocks, `onload=`, etc.). Use PNG/WebP for the same use case.
- **Accepted extensions:** `.png`, `.jpg`, `.jpeg`, `.webp`.
- **Storage path:** `/uploads/{tenantId}/logos/{uuid}.{ext}`.

**Render sizing** (enforced by the components):

- 20 px — candidate list rows, role detail cards
- 24 px — candidate detail headers
- 32 px — agency/customer list rows, PDF exports
- 64 px — agency/customer detail headers

When the logo path is null, components render an initials avatar derived from the entity name.

## Path-traversal defence-in-depth

The tenant export ZIP builder (`src/lib/export/tenant-export-builder.ts`) and the backup tooling both touch arbitrary stored paths — a malicious or buggy DB row could in principle hold a `..` segment that escapes the tenant directory. The guard:

```typescript
const tenantUploadRoot = `${UPLOAD_DIR}/${tenantId}/`
const resolved = path.resolve(absolutePath)
if (!resolved.startsWith(tenantUploadRoot)) {
  // skip this file, record in manifest.skippedFiles
  // reason: 'path-outside-tenant'
  continue
}
const stats = await fs.stat(resolved)
```

The `startsWith` check runs **before** `fs.stat` — `stat` is never invoked on a path outside the tenant root. The skipped entries land in the export's `manifest.json` with a reason so the operator can audit them.

This same defence applies to any future feature that reads stored paths in bulk (GDPR export, backup runbook integrity check, etc.). When adding a new such surface, copy the pattern — do not skip the prefix check.

## ENOENT and EACCES handling

For both CV deletion (`deleteCvFile`) and logo deletion (`deleteLogo`), `ENOENT` is silently swallowed — the file may already be gone. Other errors are re-thrown by `deleteCvFile` but swallowed by `deleteLogo` (logo deletion is always best-effort).

The tenant export builder records `ENOENT` and `EACCES` as skipped files in the export manifest rather than failing the whole export. A single bad file should never block an export.

## Production — moving to Garage

For deployments larger than a single host, the local Docker volume becomes the bottleneck (no replication, no concurrent access from multiple app pods). The supported upgrade path is **Garage**, a self-hosted S3-compatible object store:

- Drop-in replacement for the local volume — the application uses the AWS S3 SDK against Garage's S3 endpoint.
- Multi-node deployment for replication.
- No public cloud dependency (data stays on your infrastructure).

The migration is a one-time copy: `aws s3 sync ./uploads/ s3://skillai-uploads/` against the Garage endpoint, then swap the storage adapter via the `STORAGE_ENDPOINT` / `STORAGE_ACCESS_KEY` / `STORAGE_SECRET_KEY` / `STORAGE_BUCKET` environment variables. The DB-stored paths stay the same — Garage uses the same `{tenantId}/{uuid}.{ext}` key shape as the on-disk layout.

The rationale for Garage over MinIO (which moved to AGPL) and over public cloud S3 (data sovereignty) is in [DEC-005](../decisions/dec-005-storage.md).

## AWS deployment — EFS instead

On AWS EKS, the standard layout is RDS for the database + EFS for uploads. EFS appears as a normal POSIX filesystem mounted at `/app/uploads`, so no application-level changes are needed compared to the Docker volume layout. See [AWS deployment](../operations/aws-deploy.md) for the full layout.

## Related

- [System overview](./system-overview.md) — where storage sits in the request lifecycle.
- [Backup & recovery](../operations/backup-runbook.md) — how the uploads volume is backed up alongside the database dump.
- [DEC-005 — Local storage + Garage](../decisions/dec-005-storage.md) — the full decision record.
