# SkillAi → p510 k3d migration & data restore runbook

Moves the live SkillAi data (currently the docker-compose stack on **p620**)
into the ArgoCD-managed deployment on the **p510 k3d cluster**.

```
 SOURCE                          TARGET
 p620 (docker compose)           p510 (k3d, ArgoCD-managed)
 ├─ skillai-db-1  (pgvector pg17) ──dump──▶  StatefulSet skillai-db
 └─ skillai-app-1 (/app/uploads)  ──tar───▶  PVC skillai-uploads
```

Nothing here is destructive to the source — p620 keeps running until you cut over.

---

## 0. Backup (DONE — keep it safe)

A full backup was taken from the live p620 stack before any migration:

```
/home/olafkfreund/skillai-backups/<timestamp>/
├── skillai-<ts>.dump      # pg_dump custom format (pg_restore)
├── skillai-<ts>.sql.gz    # pg_dump plain SQL (psql), --no-owner
└── uploads-<ts>.tgz       # /app/uploads (CVs + logos)
```

Re-take at cutover time so the restore is current:

```bash
# on p620
TS=$(date +%Y%m%d-%H%M%S); BK=~/skillai-backups/$TS; mkdir -p "$BK"
docker exec skillai-db-1 pg_dump -U skillai -d skillai -Fc -f /tmp/skillai.dump
docker cp skillai-db-1:/tmp/skillai.dump "$BK/skillai-$TS.dump"
docker exec skillai-app-1 tar -czf /tmp/uploads.tgz -C /app uploads
docker cp skillai-app-1:/tmp/uploads.tgz "$BK/uploads-$TS.tgz"
```

---

## 1. Pre-reqs on p510

- ArgoCD has synced `skillai` (Application healthy): `skillai-db-0` running,
  `skillai-app-*` running, migrations Job `Completed`.
- The three Secrets exist in `factory` (see `deploy/k8s/README.md`).
- You have a kubeconfig/context pointing at the **p510** cluster.

> The freshly-synced app comes up against an **empty** schema (migrations ran,
> no rows). The restore below loads the real data over it. The custom dump is
> self-contained (schema + data + RLS policies + extensions), so `--clean
> --if-exists` safely replaces the empty migrated schema.

---

## 2. Copy backup artifacts to p510

```bash
# from p620 (over tailnet)
scp ~/skillai-backups/<ts>/skillai-<ts>.dump   p510:~/skillai-restore/
scp ~/skillai-backups/<ts>/uploads-<ts>.tgz    p510:~/skillai-restore/
```

---

## 3. Restore the database

```bash
# on p510 (kubectl context = p510 k3d)
DB_POD=skillai-db-0

kubectl -n factory cp ~/skillai-restore/skillai-<ts>.dump $DB_POD:/tmp/restore.dump

kubectl -n factory exec $DB_POD -- \
  pg_restore -U skillai -d skillai --clean --if-exists --no-owner --no-privileges /tmp/restore.dump

kubectl -n factory exec $DB_POD -- rm -f /tmp/restore.dump
```

`--clean --if-exists` is expected to emit a few harmless NOTICEs for objects
that don't exist yet on a fresh DB. A non-zero exit from `pg_restore` is usually
just those NOTICEs — verify with step 5 rather than trusting the exit code.

Alternative (plain SQL):

```bash
zcat skillai-<ts>.sql.gz | kubectl -n factory exec -i $DB_POD -- psql -U skillai -d skillai
```

---

## 4. Restore the uploads volume

```bash
APP_POD=$(kubectl -n factory get pod -l app.kubernetes.io/name=skillai-app -o name | head -1)

kubectl -n factory cp ~/skillai-restore/uploads-<ts>.tgz ${APP_POD#pod/}:/tmp/uploads.tgz -c app
# tar contains a top-level ./uploads — extract at /app so files land in /app/uploads
kubectl -n factory exec ${APP_POD#pod/} -c app -- tar -xzf /tmp/uploads.tgz -C /app
kubectl -n factory exec ${APP_POD#pod/} -c app -- rm -f /tmp/uploads.tgz
```

---

## 5. Verify

```bash
# row counts should match p620 (e.g. candidates=127, tenants=1 at backup time)
kubectl -n factory exec skillai-db-0 -- psql -U skillai -d skillai -tA \
  -c "select 'candidates='||count(*) from candidates; select 'tenants='||count(*) from tenants;"

# uploaded files present
kubectl -n factory exec ${APP_POD#pod/} -c app -- sh -c 'find /app/uploads -type f | wc -l'

# app health + tailnet
kubectl -n factory exec ${APP_POD#pod/} -c app -- wget -qO- http://localhost:3000/api/health
kubectl -n factory logs ${APP_POD#pod/} -c tailscale | grep -iE 'register|success'
# then browse https://skillai.tail833f7.ts.net and log in
```

---

## 6. Cutover & rollback

- **Cutover:** once verified on the tailnet, stop the p620 compose stack
  (`docker compose down` — leaves volumes intact) so there's a single writer.
- **Rollback:** the p620 stack and its volumes are untouched; bring it back with
  `docker compose up -d`. The pre-migration backup in `~/skillai-backups/<ts>/`
  restores either environment.

> Single-writer matters: never run p620 compose and the p510 deployment against
> their own DBs simultaneously and expect them to agree — they diverge. Treat
> p620 as the source of truth until cutover, then p510.
