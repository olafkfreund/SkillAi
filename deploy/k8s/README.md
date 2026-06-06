# SkillAi — Kubernetes manifests (k3d @ p510, ArgoCD)

These manifests are deployed to the **k3d cluster on p510** by **ArgoCD**, not by
hand. The factory-gitops repo's `apps/skillai/application.yaml` points its
`source.path` at this directory (`deploy/k8s`), `targetRevision:
core-mvp-foundation`, into namespace `factory`. Commit here → ArgoCD reconciles
onto p510 (~3 min). Do **not** `kubectl apply` these to a local cluster.

## What gets deployed

| Object | Kind | Notes |
|---|---|---|
| `skillai-db` | StatefulSet + headless Service | `pgvector/pgvector:pg17`, 8Gi `local-path` PVC, sync-wave 0 |
| `skillai-migrate` | Job (ArgoCD `Sync` hook, wave 1) | Drizzle migrations; re-runs each sync; waits for DB |
| `skillai-app` | Deployment + Service | Next.js standalone + Tailscale sidecar, sync-wave 2 |
| `skillai-uploads` | PVC | 5Gi `local-path` for CVs + logos |
| `skillai-db-init` | ConfigMap | extensions + `set_tenant_context` (first-init) |
| `skillai-tailscale-serve-config` | ConfigMap | serve `:443` → app `:3000` |

Exposed on the tailnet at **https://skillai.tail833f7.ts.net** via the sidecar.

## Required Secrets (seeded out-of-band — NOT in git)

Per factory convention, secrets are namespace-scoped and seeded via
`manage-secrets.sh` (agenix) in the `nixos_config` repo, never committed here.
Three Secrets must exist in namespace `factory` before/at first sync:

### `skillai-db`
| Key | Example |
|---|---|
| `POSTGRES_USER` | `skillai` |
| `POSTGRES_PASSWORD` | *(strong password)* |
| `POSTGRES_DB` | `skillai` |

### `skillai-app`
| Key | Notes |
|---|---|
| `DATABASE_URL` | `postgresql://skillai:<pw>@skillai-db:5432/skillai` (host = the in-cluster service) |
| `NEXTAUTH_SECRET` | Auth.js secret |
| `ANTHROPIC_API_KEY` | Claude API key |
| `ENCRYPTION_KEY` | app field-encryption key |
| `BRAVE_SEARCH_API_KEY` | optional |
| `GITHUB_TOKEN` | optional |

### `tailscale-auth-key`
| Key | Notes |
|---|---|
| `TS_AUTHKEY` | reusable/ephemeral tailnet auth key (same pattern as other factory apps) |

Quick manual seed (if not using agenix), run against the **p510** cluster:

```bash
kubectl -n factory create secret generic skillai-db \
  --from-literal=POSTGRES_USER=skillai \
  --from-literal=POSTGRES_PASSWORD='REPLACE_ME' \
  --from-literal=POSTGRES_DB=skillai

kubectl -n factory create secret generic skillai-app \
  --from-literal=DATABASE_URL='postgresql://skillai:REPLACE_ME@skillai-db:5432/skillai' \
  --from-literal=NEXTAUTH_SECRET='REPLACE_ME' \
  --from-literal=ANTHROPIC_API_KEY='REPLACE_ME' \
  --from-literal=ENCRYPTION_KEY='REPLACE_ME' \
  --from-literal=BRAVE_SEARCH_API_KEY='REPLACE_ME' \
  --from-literal=GITHUB_TOKEN='REPLACE_ME'

# tailscale-auth-key may already be seeded cluster-wide at bootstrap.
```

## Image

Built + pushed to GHCR by `.github/workflows/deploy-image.yml`:
`ghcr.io/olafkfreund/skillai` (runner) and `ghcr.io/olafkfreund/skillai-migrator`.
Bump the deployed tag centrally in `kustomization.yaml` (`images:`); pin an
immutable `:<sha>` for production. The GHCR packages must be **public**, or add
an `imagePullSecret` to the pods' ServiceAccount.

## Data migration

Existing data lives in the docker-compose stack on **p620**. See
[`../migration/RUNBOOK.md`](../migration/RUNBOOK.md) to restore the DB dump +
uploads tarball into this in-cluster deployment.
