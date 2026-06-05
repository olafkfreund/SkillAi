# Backup & recovery

_Postgres dump plus uploads tarball — the operator-level backup procedure, restore steps, and what NOT to confuse with backups._

SkillAI runs two complementary backup mechanisms: an **operator-level full backup** (Postgres dump + uploads tarball) and an **admin-level per-tenant JSON export** triggered from the UI. They are not interchangeable. This page is the operator-level procedure.

> **⚠️ Caution**
>
> **Take a backup before any runtime change.** Editing `docker-compose.yml`, the Dockerfile, env vars, or running a migration — back up first. The portal is in continuous live use, not a sandbox. Doc/script-only edits don't need it.

## RTO / RPO targets

| Target | Value | Achieved by |
|---|---|---|
| **RPO** — max data loss | 24 hours (default daily cadence) | Daily `pg_dump` + uploads tarball cron |
| **RTO** — max recovery time | &lt; 15 minutes for &lt;100 MB datasets | `pg_restore` + tar extract on the same host |

Both targets are conservative for the current dataset (~10 MB dump, ~118 candidates). They scale linearly with data — at 10× the size, restore time roughly 10× (still well under an hour).

## When to back up

**Take a backup before:**

- Editing `docker-compose.yml` or `docker-compose.override.yml`
- Editing the `Dockerfile`
- Changing environment variables (`.env`, `.env.local`)
- Running a database migration (`drizzle-kit push`, `drizzle-kit migrate`, raw SQL)
- Upgrading the database image (`pgvector/pgvector:pgXX`)
- Restoring from a previous backup
- Any change that touches the `uploads_data` or `postgres_data` Docker volume

**Backups are not required for:**

- Documentation-only edits
- Script-only edits that aren't invoked as part of the change
- Application code changes that don't touch the schema and don't run a migration

If in doubt, back up. It takes under a minute and the dump is ~10 MB.

## Pre-flight checklist

```bash
# 1. Confirm services are healthy
docker compose ps
# Both skillai-app-1 and skillai-db-1 should be "running (healthy)".
# If db is unhealthy or restarting, DO NOT take a backup — investigate first.

# 2. Confirm disk space
df -h .
# Allow at least 1 GB free.

# 3. Pick a target directory
TS=$(date +%Y%m%d-%H%M%S)
mkdir -p backups/$TS
echo "Target: backups/$TS"
```

`backups/` is gitignored — backups never get committed.

## Backup procedure

All three commands run from the SkillAI repo root.

### 1. Database dump

```bash
docker exec skillai-db-1 pg_dump \
  --format=custom --compress=9 \
  -U skillai skillai \
  > backups/$TS/skillai.dump
```

- `--format=custom` produces a portable binary archive `pg_restore` can read selectively or in full.
- `--compress=9` is maximum zlib compression. CPU cost is negligible for a ~10 MB DB.
- Verify the container name with `docker compose ps` if you've renamed the project.

### 2. Uploads volume backup

```bash
docker run --rm \
  -v skillai_uploads_data:/source:ro \
  -v "$(pwd)/backups/$TS":/backup \
  alpine tar -czf /backup/uploads.tar.gz -C /source .
```

- `:ro` mounts the source read-only — the backup cannot accidentally write to live data.
- `-C /source .` archives the contents of `/source` directly (no leading prefix), making restore extraction symmetric.

### 3. Integrity manifest

```bash
cd backups/$TS && sha256sum skillai.dump uploads.tar.gz > MANIFEST.sha256 && cd -
```

The manifest catches bitrot when backups are copied to slow / unreliable storage (NAS, USB), and confirms "this is the exact dump from that date" before restoring over live data.

### 4. (Recommended) Drop a `README.txt`

```bash
cat > backups/$TS/README.txt <<EOF
SkillAI backup taken before <reason>.

Date: $(date -Iseconds)
Reason: <one sentence>

Files:
  skillai.dump      pg_dump --format=custom --compress=9 of the skillai DB
  uploads.tar.gz    tar of the skillai_uploads_data Docker volume
  MANIFEST.sha256   sha256 sums for both files
EOF
```

Pre-change backups (named with a clear reason in `README.txt`) are forensic gold — never prune them.

## Verifying a backup

Before trusting any backup — especially before a restore — verify it.

```bash
cd backups/<TS> && sha256sum -c MANIFEST.sha256
```

Expected:

```
skillai.dump: OK
uploads.tar.gz: OK
```

If either says `FAILED`, **do not restore**. Inspect the dump's table of contents without restoring:

```bash
docker exec -i skillai-db-1 pg_restore --list < backups/<TS>/skillai.dump | head -40
```

You should see schema objects (`SCHEMA - public`, `TABLE - candidates`, etc.) and data items.

```bash
tar -tzf backups/<TS>/uploads.tar.gz | head -20
```

You should see paths like `./<tenant-uuid>/cv/<file>.pdf` and `./<tenant-uuid>/logos/<file>.png`.

## Restore procedure

> **⚠️ Caution**
>
> **Destructive.** A restore overwrites the live database and uploads volume. Read this whole section before running anything.

### Pre-restore checklist

1. **Verify the backup first** (above). Restoring from a corrupt dump leaves you with neither the old state nor the new.
2. **Notify users** — restore breaks any in-flight session.
3. **Take a fresh backup of the current (broken) state** before restoring. You may want to triage the broken DB later, and `pg_restore --clean` will erase it.

### Step 1 — Stop the app, keep the DB up

```bash
docker compose stop app migrate
```

Leave `db` running — `pg_restore` connects to it.

### Step 2 — Restore the database

```bash
docker cp backups/<TS>/skillai.dump skillai-db-1:/tmp/skillai.dump
docker exec skillai-db-1 pg_restore \
  --clean --if-exists \
  -U skillai -d skillai \
  /tmp/skillai.dump
docker exec skillai-db-1 rm /tmp/skillai.dump
```

`--clean --if-exists` drops every object before recreating it. Warnings about extensions (`pgvector`) already existing are safe to ignore.

### Step 3 — Restore the uploads volume

```bash
docker run --rm \
  -v skillai_uploads_data:/target \
  -v "$(pwd)/backups/<TS>":/backup \
  alpine sh -c "rm -rf /target/* && tar -xzf /backup/uploads.tar.gz -C /target"
```

`rm -rf /target/*` wipes the live uploads volume before extracting the backup over it. **Never run this except as part of an actual restore.**

### Step 4 — Restart the app

```bash
docker compose start app
```

`migrate` will re-run on the next `docker compose up`, which is harmless — the restored schema already matches the migrations it would apply.

### Step 5 — Smoke-test

1. Open `http://localhost:3000` and sign in with a known account.
2. Open **Candidates** — confirm rows are present.
3. Open a known **Role** detail page — confirm ranked candidates render.
4. Download a CV — confirms the uploads volume restored correctly.
5. Check `docker compose logs app | tail -50` for any startup errors.

If any fail, capture the logs immediately and stop.

## Retention

Operator's discretion. Suggested cadence:

| Tier | Cadence | Keep |
|---|---|---|
| Hourly | Not recommended | — |
| Daily | Cron (see below) | Last **7** |
| Weekly | First daily of each week | Last **4** |
| Monthly | First daily of each month | Last **12** |
| Pre-change | Ad-hoc, before any runtime change | **Indefinite** — these are forensic gold |

## Cron'ed daily backup (sketch)

Not implemented in-repo. If you choose to automate:

```bash
# /etc/cron.d/skillai-backup — adjust user, path, and time
0 3 * * * youruser cd /path/to/SkillAi && /usr/local/bin/skillai-backup.sh >> /var/log/skillai-backup.log 2>&1
```

The wrapper would: set `TS=$(date +%Y%m%d-%H%M%S)`, run the three backup commands above, prune `backups/` per the retention table, exit non-zero on any failure so cron emails the operator.

## Off-host copy (gap, not prescription)

Backups on the same host as the database protect against application-level failures (bad migration, corrupted row). They **do not** protect against host loss (disk failure, theft, ransomware, accidental `rm -rf /`).

A complete strategy copies backups off the SkillAI host. Options range from cheap to robust:

- `rsync` to a NAS over the local network (no encryption by default)
- `restic` or `borg` to a remote repository (deduplicating, encrypted at rest)
- S3-compatible remote (AWS S3, Backblaze B2, Garage) via `rclone` or `aws s3 sync`
- Tarsnap (encrypted, deduplicating, paid)

If you do nothing else, **copy the latest pre-change backup to a USB drive every month**. Primitive but better than zero.

## NOT a backup — the GDPR / DSAR export

SkillAI exposes two in-app exports that operators sometimes confuse with backups:

- **Per-tenant JSON export** (Settings → Backups & Data Export) — admin-triggered ZIP with one JSON per table, scoped to a single tenant. Useful as a DSAR response or for tenant migration. **Not a backup** — restore-from-export is not implemented and binary files (CVs) are only included via the opt-in `?files=1` flag.
- **GDPR per-candidate erasure** ([DEC-011](../decisions/dec-011-gdpr-erasure.md)) — hard-deletes a candidate's data with audit-log redaction. The companion DSAR export covers the candidate's own data, not the tenant.

Neither replaces a Postgres dump. They serve compliance use cases, not disaster recovery.

## What this runbook does NOT cover

Each would need its own document and operator decisions:

- **Point-in-time recovery (PITR)** — restoring to an arbitrary moment between dumps. Requires WAL archive shipping; worth considering once the dataset grows beyond what a 24-hour-RPO dump can lose.
- **Encrypted backups at rest** — current backups are unencrypted on local disk. Acceptable while the host is trusted; not acceptable for off-host third-party storage. `gpg`, `age`, or `restic` are all reasonable.
- **Multi-region replication** — only relevant once file storage is on Garage / S3 and there's a second region to replicate to.
- **Per-tenant restore** — the dump is database-wide. Surgical restore of one tenant requires either the in-app JSON export (already shipped) or a temporary parallel database.
- **Schema-only / data-only dumps** — `pg_dump --schema-only` / `--data-only` aren't the default and aren't covered here.

When any of these become real needs, add them as separate documents rather than bolting onto this runbook.

## Related

- [Health & monitoring](./health-monitoring.md) — verify the DB is healthy before backing up.
- [AWS deployment](./aws-deploy.md) — RDS snapshots replace the manual `pg_dump` flow in EKS deployments.
- [DEC-011 — GDPR erasure pattern](../decisions/dec-011-gdpr-erasure.md) — what the per-candidate hard-delete actually does.
