# Backup & Restore Runbook

Operator-facing procedure for backing up and restoring SkillAi. Captures the muscle-memory procedure used in recent ops sessions (see `backups/20260505-160619/` for the most recent example artefact).

> Operator's standing rule: **"do not break anything and always do a backup of the data. I'm using the portal all the time."**

A short, higher-level summary lives in [`setup.md`](./setup.md#data-export--backup-policy). This document is the detailed procedure that summary points at.

---

## When to back up

Take a backup **before any runtime change**:

- Editing `docker-compose.yml` or `docker-compose.override.yml`
- Editing the `Dockerfile`
- Changing environment variables (`.env`, `.env.local`)
- Running a database migration (`drizzle-kit push`, `drizzle-kit migrate`, raw SQL)
- Upgrading the database image (`pgvector/pgvector:pgXX`)
- Restoring from a previous backup (yes — back up first, you may want to roll forward)
- Any change that touches the `uploads_data` or `postgres_data` Docker volume

Backups are **not required** for:

- Documentation-only edits (`docs/`, `*.md`, comments)
- Script-only edits that aren't invoked as part of the change (`scripts/`)
- Application code changes that don't touch the schema and don't run a migration

If you're not sure, back up. It takes under a minute and the dump is ~10 MB.

---

## Pre-flight checklist

1. **Confirm services are up:**

   ```bash
   docker compose ps
   ```

   Both `skillai-app-1` and `skillai-db-1` should be `running (healthy)`. If `db` is unhealthy or restarting, **do not** take a backup — investigate first. A dump from a corrupted DB is worse than no dump.

2. **Confirm disk space:**

   ```bash
   df -h .
   ```

   A backup is roughly `pg_dump size + uploads volume size`. Today's dump is ~10 MB; uploads grow over time. Allow at least 1 GB of free space for safety.

3. **Pick a target directory:**

   ```bash
   TS=$(date +%Y%m%d-%H%M%S)
   mkdir -p backups/$TS
   echo "Target: backups/$TS"
   ```

   The `backups/` directory is gitignored (`.gitignore` line 47) — backups will never be committed.

---

## Backup procedure

All three commands below run from the SkillAi repo root. They write to `backups/$TS/`.

### 1. Database dump

```bash
docker exec skillai-db-1 pg_dump \
  --format=custom --compress=9 \
  -U skillai skillai \
  > backups/$TS/skillai.dump
```

Notes:

- `--format=custom` produces a portable binary archive that `pg_restore` can read selectively (e.g. restore one table) or in full.
- `--compress=9` is maximum zlib compression. The CPU cost is negligible for a ~10 MB database.
- `skillai-db-1` is the container name (project `skillai` + service `db` + replica `1`). Verify with `docker compose ps` if the project name differs.
- DB user and database name are both `skillai` by default. If you've overridden `POSTGRES_USER` / `POSTGRES_DB` in `.env`, substitute accordingly.

### 2. Uploads volume backup

```bash
docker run --rm \
  -v skillai_uploads_data:/source:ro \
  -v "$(pwd)/backups/$TS":/backup \
  alpine tar -czf /backup/uploads.tar.gz -C /source .
```

Notes:

- `skillai_uploads_data` is the Docker volume name (project `skillai` + volume `uploads_data` from `docker-compose.yml`). Verify with `docker volume ls`.
- `:ro` mounts the source volume read-only — the backup cannot accidentally write to live data.
- `-C /source .` archives the contents of `/source` directly (no leading `source/` prefix in the tarball), which makes the restore extraction symmetric.

### 3. Integrity manifest

```bash
cd backups/$TS && sha256sum skillai.dump uploads.tar.gz > MANIFEST.sha256 && cd -
```

This produces the two-line manifest used for verification on restore.

### 4. (Optional but recommended) Drop a `README.txt`

A one-paragraph note explaining *why* this backup was taken makes future-you's life easier:

```bash
cat > backups/$TS/README.txt <<EOF
SkillAi backup taken before <reason>.

Date: $(date -Iseconds)
Reason: <one sentence — e.g. "Adding DNS upstreams to compose">

Files:
  skillai.dump      pg_dump --format=custom --compress=9 of the skillai DB
  uploads.tar.gz    tar of the skillai_uploads_data Docker volume
  MANIFEST.sha256   sha256 sums for both files
EOF
```

See `backups/20260505-160619/README.txt` for an example.

---

## Manifest format

`MANIFEST.sha256` is exactly two lines, in the standard `sha256sum` format:

```text
bd068d98a4eae398b6d3b9cb277d1d998db819957991c77af1bc01d49caba5da  skillai.dump
4d4cb8257017ee0d20b78619c4a16c2f590f3d257f4b5d0687c8f29e708d92bd  uploads.tar.gz
```

Why we have it:

- Detects bitrot if backups are copied to slow / unreliable storage (NAS, USB).
- Detects accidental truncation if a backup is interrupted partway.
- Lets you confirm "this is the exact dump from that date" before restoring over live data.

---

## Verifying a backup

Before trusting any backup — especially before a restore — verify it.

### Check checksums

```bash
cd backups/<TS> && sha256sum -c MANIFEST.sha256
```

Expected output:

```text
skillai.dump: OK
uploads.tar.gz: OK
```

If either file says `FAILED`, **do not restore from this backup**. The file is corrupt.

### Inspect the dump's contents without restoring

```bash
docker exec -i skillai-db-1 pg_restore --list < backups/<TS>/skillai.dump | head -40
```

Lists the dump's table-of-contents. You should see schema objects (`SCHEMA - public`, `TABLE - candidates`, `TABLE - roles`, etc.) and data items. If `pg_restore --list` errors out, the dump is unreadable.

### Inspect the uploads tarball

```bash
tar -tzf backups/<TS>/uploads.tar.gz | head -20
```

You should see paths like `./<tenant-uuid>/cv/<file>.pdf` and `./<tenant-uuid>/logos/<file>.png`.

---

## Restore procedure

**DESTRUCTIVE.** Read this entire section before running anything. A restore overwrites the live database and uploads volume.

### When to restore

- Recovering from a failed migration or a botched compose change
- Rolling back after a corrupted state (rare — usually a bad deploy)
- Setting up a staging clone from a production backup (out of scope here)

### Pre-restore checklist

1. **Verify the backup first** (see "Verifying a backup" above). Restoring from a corrupt dump leaves you with neither the old state nor the new.
2. **Notify users** if the portal is in active use. The operator's standing rule applies in reverse: a restore *will* break things for anyone mid-session.
3. **Take a fresh backup of the current (broken) state** before restoring. You may want to triage the broken DB later, and `pg_restore --clean` will erase it.

### Step 1 — Stop the app (keep the DB up)

```bash
docker compose stop app migrate
```

Leave `db` running — `pg_restore` connects to it. Stopping `app` prevents in-flight queries during the restore.

### Step 2 — Restore the database

```bash
docker cp backups/<TS>/skillai.dump skillai-db-1:/tmp/skillai.dump
docker exec skillai-db-1 pg_restore \
  --clean --if-exists \
  -U skillai -d skillai \
  /tmp/skillai.dump
docker exec skillai-db-1 rm /tmp/skillai.dump
```

Notes:

- `--clean --if-exists` drops every object in the dump before recreating it. This is what makes the restore destructive — pre-existing tables, rows, and indexes are erased.
- `pg_restore` is run via `docker exec` against an already-running `db` container — there is no need to recreate the container or volume.
- You may see warnings about extensions (`pgvector`) already existing. These are safe to ignore — the `--if-exists` flag handles them.

### Step 3 — Restore the uploads volume

```bash
docker run --rm \
  -v skillai_uploads_data:/target \
  -v "$(pwd)/backups/<TS>":/backup \
  alpine sh -c "rm -rf /target/* && tar -xzf /backup/uploads.tar.gz -C /target"
```

The `rm -rf /target/*` step is destructive — it wipes the live uploads volume before extracting the backup over it. **Never run this except as part of an actual restore.**

### Step 4 — Restart the app

```bash
docker compose start app
```

`migrate` will re-run on the next `docker compose up`, which is harmless — the restored schema already matches the migrations it would apply.

### Step 5 — Smoke-test the portal

After restart, verify the system is functional before considering the restore done:

1. Open `http://localhost:3000` and sign in with a known account.
2. Open the **Candidates** list — confirm rows are present.
3. Open a known **Role** detail page — confirm ranked candidates render.
4. Download a CV from a candidate detail page — confirms the uploads volume restored correctly.
5. Check `docker compose logs app | tail -50` for any startup errors.

If any of those fail, capture the logs immediately. Do not take another action until you understand why.

---

## Retention

Suggested cadence — operator's discretion:

| Tier      | Cadence                  | Keep                                         |
|-----------|--------------------------|----------------------------------------------|
| Hourly    | Not recommended          | —                                            |
| Daily     | Cron, see appendix below | Last **7**                                   |
| Weekly    | First daily of each week | Last **4**                                   |
| Monthly   | First daily of each month| Last **12**                                  |
| Pre-change| Ad-hoc, before any runtime change | Indefinite — these are forensic gold |

Pre-change backups (named with a clear reason in `README.txt`) should never be pruned automatically. They're the breadcrumbs of what was changed when something later goes wrong.

---

## Appendix A — Cron'ed daily backup (sketch)

This is a sketch only. Not implemented. If you choose to automate, the rough shape is:

```bash
# /etc/cron.d/skillai-backup
# 03:00 daily — adjust for your tz and load profile
0 3 * * * olafkfreund cd /home/olafkfreund/Source/GitHub/SkillAi && /usr/local/bin/skillai-backup.sh >> /var/log/skillai-backup.log 2>&1
```

The wrapper script (`scripts/backup.sh` — does not exist yet) would:

1. Set `TS=$(date +%Y%m%d-%H%M%S)`
2. Run the three backup commands above
3. Prune `backups/` per the retention table (e.g. delete daily dirs older than 7 days)
4. Exit non-zero on any failure so cron emails the operator

Decision deferred: pruning logic, log rotation, and on-failure alerting all need operator opinions before being written.

---

## Appendix B — Off-host copy (gap, not prescription)

**Backups on the same host as the database protect against application-level failures (bad migration, corrupted row). They do not protect against host loss (disk failure, drive theft, ransomware, accidental `rm -rf /`).**

A complete backup strategy copies backups *off* the SkillAi host. Options range from cheap to robust:

- `rsync` to a NAS over the local network (cheapest, no encryption by default)
- `restic` or `borg` to a remote repository (deduplicating, encrypted at rest)
- S3-compatible remote (AWS S3, Backblaze B2, self-hosted Garage) via `rclone` or `aws s3 sync`
- Tarsnap (encrypted, deduplicating, paid)

This runbook does not prescribe a tool — that's an operator decision tied to threat model, budget, and existing infrastructure. The gap is acknowledged here so it can be filled deliberately rather than forgotten.

If you do nothing else, **at least copy the latest pre-change backup to a USB drive every month**. It's primitive but it's better than zero.

---

## What this runbook does NOT cover

The following are deliberately out of scope. Each would need a separate runbook and operator decisions before being implemented:

- **Point-in-time recovery (PITR)** — restoring to an arbitrary moment between dumps. Requires WAL archive shipping (`archive_command`) and is meaningfully more complex than the dump+restore model documented here. Worth considering once the dataset grows beyond what a 24-hour-RPO dump can lose.
- **Encrypted backups at rest** — current backups are unencrypted on local disk. Acceptable while the host itself is trusted and access-controlled; not acceptable for off-host storage on third-party infrastructure. `gpg`, `age`, or `restic`'s built-in encryption are all reasonable choices when this is addressed.
- **Multi-region replication** — only relevant when (a) the file-storage backend has moved off the local volume to Garage / S3, and (b) there's a second region to replicate to. Both are open roadmap items.
- **Per-tenant restore** — the dump is database-wide. Restoring one tenant's data without affecting others requires either a logical export (already available via the admin "Backups & Data Export" panel — see `setup.md`) or a temporary parallel database for surgical extraction. Not common enough to script.
- **Schema-only or data-only dumps** — `pg_dump --schema-only` / `--data-only` are useful in narrow cases but aren't the default and aren't covered here.

When any of these are needed, they'll be added as separate documents under `docs/` rather than bolted onto this runbook.
