# SkillAi — AWS EKS Deploy Runbook

> Region: eu-west-2 (London)
> Cost tier: minimum-viable (~$150/mo realistic; see cost section)
> Architecture: 1x t4g.small EKS node, RDS db.t4g.micro, EFS uploads, NLB + nip.io TLS

This runbook covers the full lifecycle: first-time bootstrap, app deploys, day-2 ops, and tear-down.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [One-Time Bootstrap](#2-one-time-bootstrap)
3. [Build and Deploy the App](#3-build-and-deploy-the-app)
4. [Migrate Data (First Deploy Only)](#4-migrate-data-first-deploy-only)
5. [Verify the Deployment](#5-verify-the-deployment)
6. [Day-2 Operations](#6-day-2-operations)
7. [Tear-Down](#7-tear-down)
8. [Troubleshooting](#8-troubleshooting)
9. [Cost Reference](#9-cost-reference)
10. [Architecture Notes](#10-architecture-notes)

---

## 1. Prerequisites

### 1.1 Required tools

Install these before running any infra script. `00-preflight.sh` will verify them.

| Tool | Min version | Install |
|---|---|---|
| `aws` CLI | 2.15 | https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html |
| `kubectl` | 1.30 | https://kubernetes.io/docs/tasks/tools/ |
| `terraform` | 1.7 | https://developer.hashicorp.com/terraform/install |
| `helm` | 3.14 | https://helm.sh/docs/intro/install/ |
| `direnv` | 2.x | https://direnv.net/#basic-installation |
| `docker` | 24+ | https://docs.docker.com/get-docker/ |
| `psql` | 15+ | `apt install postgresql-client` / `brew install libpq` |

On macOS with Homebrew: `brew install awscli kubectl terraform helm direnv postgresql`

### 1.2 AWS account

You need an AWS account with permissions for: EKS, RDS, EFS, ECR, EC2 (VPC, subnets, NAT, NLB), IAM (OIDC provider, IRSA roles).

Create a named profile:

```bash
aws configure --profile skillai
# Enter: Access Key ID, Secret Access Key, region=eu-west-2, output=json
```

### 1.3 `.envrc` setup

```bash
cp .envrc.example .envrc
```

Fill in `.envrc`:

- `AWS_PROFILE` (or `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`)
- `AWS_REGION=eu-west-2`
- `ENCRYPTION_KEY` — copy **verbatim** from your local `.env.local`
- `AUTH_SECRET` — copy **verbatim** from your local `.env.local`
- `ANTHROPIC_API_KEY` — your Anthropic API key
- Leave `NEXTAUTH_URL`, `APP_URL`, `NEXT_PUBLIC_APP_URL` blank for now — set them after step 2.3

Activate:

```bash
direnv allow
```

### Critical: ENCRYPTION_KEY constraint

The `ENCRYPTION_KEY` encrypts tenant API keys stored in the `tenant_settings` table using AES-256-GCM. **If you deploy a different key, every tenant's stored API keys become unreadable and the app crashes on any AI operation.**

Rule: `ENCRYPTION_KEY` in `.envrc` must be an exact copy of the value in your local `.env.local`. The `50-render-secret.sh` script asserts this before generating the Kubernetes Secret and refuses to proceed if they differ.

---

## 2. One-Time Bootstrap

Run these steps in order on first deploy.

### 2.1 Preflight

```bash
infra/scripts/00-preflight.sh
```

What to look for: "All preflight checks PASSED." If any check fails, fix the tool or env var before continuing.

### 2.2 Bootstrap Terraform remote state (run ONCE, ever)

Before the first Terraform apply you must provision the S3 bucket and DynamoDB lock table that Terraform will use to store and lock its state. This is a chicken-and-egg problem: Terraform cannot manage its own state backend, so we use a one-shot bootstrap script.

```bash
infra/scripts/05-state-bootstrap.sh
```

What it does:

- Creates an S3 bucket named `skillai-terraform-state-<account-id>-<region>`.
- Enables versioning + SSE-KMS encryption on the bucket.
- Blocks all public access on the bucket.
- Creates a DynamoDB table named `skillai-terraform-lock` with PAY_PER_REQUEST billing.
- Writes `infra/terraform/backend.tf` with the resolved bucket/key/region values.

The script is **idempotent** — re-running it on an already-bootstrapped environment is safe.

After the script completes, commit `infra/terraform/backend.tf` if it is not already in the repo.

**Subsequent operators** (team members joining later, or CI runners) do NOT run this script. They just run `terraform init`, which reads `backend.tf` and fetches state from the existing S3 bucket automatically.

**Migrating from a local `terraform.tfstate`**: If you previously ran Terraform with local state, run:

```bash
cd infra/terraform && terraform init -migrate-state
```

Terraform will prompt you to copy the local state to S3. After the migration completes, delete the local copy:

```bash
rm -f infra/terraform/terraform.tfstate infra/terraform/terraform.tfstate.backup
```

### 2.3 Terraform — provision AWS infrastructure

```bash
infra/scripts/10-terraform-apply.sh
```

This provisions (in 18–25 minutes: EKS control plane ~12 min, RDS ~8 min, NAT/EFS/IAM concurrent):
- VPC `10.10.0.0/16` with 2 public + 2 private subnets across 2 AZs
- NAT Gateway in eu-west-2a (required for Anthropic/Gemini egress)
- EKS cluster `skillai` v1.30 with 1x t4g.small managed node
- RDS PostgreSQL 17 `db.t4g.micro`, single-AZ, 20GB gp3, private subnet
- EFS filesystem for uploads (RWX)
- ECR repository `skillai`
- IAM: OIDC provider, IRSA roles for EFS CSI driver

The script will show you the plan and prompt `Apply? (y/N)` — review the plan before confirming.

After apply, outputs are printed. Note the values — they are read automatically by subsequent scripts.

#### Recovery from mid-failure
If the apply is interrupted or times out partway through:
```bash
infra/scripts/10-terraform-apply.sh
```
Re-run the script — Terraform is idempotent. Resources already created are detected and skipped; the apply continues from where it left off.

### 2.3 Configure kubeconfig

```bash
infra/scripts/20-kubeconfig.sh
```

Reads `cluster_name` from Terraform output and runs `aws eks update-kubeconfig`. Verifies nodes are Ready.

What to look for: `kubectl get nodes` showing 1 node in `Ready` state.

### 2.4 Install cluster platform components

```bash
infra/scripts/30-platform-install.sh
```

Installs (in order):
1. **AWS EFS CSI driver** — enables EFS-backed PersistentVolumes
2. **EFS StorageClass** — substitutes the EFS filesystem ID from Terraform
3. **NGINX Ingress Controller** — Helm chart, NLB-backed (1 replica)
4. **cert-manager v1.16.5** — manages TLS certificates via Let's Encrypt
5. **ClusterIssuer** — configures ACME HTTP-01 challenge against the NGINX ingress

At the end, the script prints the **NLB IP** and the **nip.io hostname**:

```
[platform] NLB IP      : 18.132.45.67
[platform] nip.io URL  : https://18.132.45.67.nip.io
```

**ACTION REQUIRED**: Update `.envrc` with this value:

```bash
export NEXTAUTH_URL="https://18.132.45.67.nip.io"
export APP_URL="https://18.132.45.67.nip.io"
export NEXT_PUBLIC_APP_URL="https://18.132.45.67.nip.io"
```

Then re-activate: `direnv allow`

Note: NLB IP assignment can take 2-5 minutes after NGINX install. If the IP is not shown, run:
```bash
kubectl get svc ingress-nginx-controller -n ingress-nginx
dig +short <nlb-hostname>
```

#### Recovery from mid-failure
If the platform install fails partway through:
```bash
infra/scripts/30-platform-install.sh
```
Re-run the script — both `helm upgrade --install` and `kubectl apply` are idempotent. Cert-manager, NGINX ingress, and EFS CSI driver all converge to the desired state.

---

## 3. Build and Deploy the App

### 3.1 Build and push the container image

```bash
infra/scripts/40-push-image.sh
```

Builds a `linux/arm64` image (required for Graviton t4g nodes) using `docker buildx` and pushes it to ECR with tags `:latest` and `:<git-sha>`.

**ARM build is mandatory.** The existing Dockerfile uses `node:22-alpine` (multi-arch). Passing `--platform linux/arm64` via buildx produces a Graviton-compatible image. Your local dev docker-compose is unaffected.

First build takes 5-10 minutes. Subsequent builds are faster due to layer caching.

### 3.2 Render the Kubernetes Secret

```bash
infra/scripts/50-render-secret.sh
```

Reads vars from `.envrc` + RDS connection details from Terraform outputs and generates `infra/k8s/base/secret.yaml`. This file is gitignored and must never be committed.

The script asserts that `ENCRYPTION_KEY` in `.envrc` matches the value in your local `.env.local`. If they differ, it aborts.

Re-run this whenever you change `NEXTAUTH_URL` or any other secret.

### 3.3 Deploy to EKS

```bash
infra/scripts/80-deploy.sh
```

This:
1. Substitutes `__ECR_REPO__`, `__IMAGE_TAG__`, `__INGRESS_HOST__` in kustomize files
2. Applies `infra/k8s/overlays/prod` (includes the rendered secret, deployment, service, ingress, PVC)
3. Waits for the migrate Job to complete (runs Drizzle migrations against RDS)
4. Waits for the deployment rollout
5. Prints the ingress URL

What to look for: "Deployment complete. Application URL: https://..."

#### Recovery from mid-failure
If the deployment fails partway through:
```bash
infra/scripts/80-deploy.sh
```
Re-run the script — `kubectl apply -k` is declarative and idempotent. Resources already created are updated in-place; new resources are created.

**Important:** If a previous migrate Job exists and you are re-running, delete the old Job first:
```bash
kubectl delete job skillai-migrate -n skillai
```
This prevents conflicts. The Job is defined in the kustomization; a fresh apply will create it if needed.

---

## 4. Migrate Data (First Deploy Only)

These steps are only needed once — on initial deploy when you want to move existing data from the local docker-compose environment to RDS/EFS.

### 4.1 Schema + data restore

```bash
infra/scripts/60-db-migrate.sh
```

**Phase A — Schema**: Runs a one-shot `kubectl run` pod using the app image to apply all Drizzle migrations against RDS. Also ensures `CREATE EXTENSION IF NOT EXISTS vector` runs before schema creation (required for pgvector).

**Phase B — Data**: Dumps your local PostgreSQL database using `pg_dump`, spins up a `postgres:17-alpine` bastion pod in the cluster, copies the dump in, and runs `pg_restore --data-only`. Phase B prompts before proceeding.

Default local DB connection (override in `.envrc` if needed):
- Host: `localhost`, Port: `5433`, DB: `skillai`, User: `skillai`

#### Recovery from mid-failure
Phase A (schema migrations) can be re-run safely — Drizzle tracks applied migrations via the journal.

Phase B (data restore) is **NOT idempotent on re-run.** If `pg_restore --data-only` fails partway through:

**Option 1 (recommended):** Truncate all tables before re-running:
```bash
kubectl run -it --rm psql-helper --image postgres:17 -n skillai -- \
  psql "postgresql://skillai:${RDS_PASSWORD}@${RDS_ENDPOINT}:5432/skillai" \
  -c "TRUNCATE candidates, roles, scores, agencies, notes, users, tenants, \
       candidate_role_approvals, interview_slots, interview_packs, \
       cv_profiles, candidate_enrichments, sent_emails, transcript_analyses, \
       interview_transcripts, interview_questions, code_challenges, \
       candidate_enrichments, audit_logs CASCADE;"
```
Then re-run: `infra/scripts/60-db-migrate.sh`

**Option 2:** Drop and re-create the schema:
```bash
kubectl run -it --rm psql-helper --image postgres:17 -n skillai -- \
  psql "postgresql://skillai:${RDS_PASSWORD}@${RDS_ENDPOINT}:5432/skillai" \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
```
Then re-run both `60-db-migrate.sh` (Phase A to recreate schema) and Phase B (data restore).

### 4.2 Sync upload files to EFS

```bash
infra/scripts/70-uploads-sync.sh
```

Spins up a `busybox` helper pod with the EFS PVC mounted, copies all files from `./uploads/` using `kubectl cp`, verifies the file count, and tears down the helper pod.

Prerequisites: The `skillai` namespace and `skillai-uploads` PVC must exist. If `80-deploy.sh` has already run once, they exist. If running uploads-sync before first deploy, create them:

```bash
kubectl apply -f infra/k8s/base/namespace.yaml
kubectl apply -f infra/k8s/base/pvc.yaml
```

---

## 5. Verify the Deployment

```bash
infra/scripts/90-verify.sh
```

Polls `https://<host>/api/health` up to 30 times (150s total) waiting for `{"status":"ok","db":"ok"}`. TLS cert issuance via Let's Encrypt HTTP-01 typically completes in 30-60s.

What "healthy" looks like:

```json
{
  "status": "ok",
  "db": "ok",
  "uptime": 42.3,
  "timestamp": "2026-05-20T12:00:00.000Z"
}
```

Also prints `kubectl get all,certificate,ingress -n skillai`. All pods should be `Running`, the certificate should show `Ready=True`.

### Manual end-to-end checks

After `90-verify.sh` passes, confirm these manually:

1. Log in at `https://<host>` with your existing credentials (proves `AUTH_SECRET` preserved)
2. View the candidate list (proves RLS + tenant context work on RDS)
3. Trigger a rescore on one candidate (proves NAT egress to api.anthropic.com + ENCRYPTION_KEY correct)
4. Download a candidate PDF with a logo (proves EFS mounted + populated)
5. Check `kubectl logs deployment/skillai-app -n skillai` for any startup errors

---

## 6. Day-2 Operations

### Re-deploy after a code change

```bash
infra/scripts/40-push-image.sh   # build + push new image
infra/scripts/80-deploy.sh       # apply new image to cluster
```

The deployment performs a rolling update (1 replica, so there is a brief downtime window of ~30s during pod replacement). If you need zero-downtime, increase `replicas: 2` in `deployment.yaml` and bump the node group to min=2.

### Check application logs

```bash
kubectl logs deployment/skillai-app -n skillai --tail=100 --follow
```

For the migrate job (on most recent deploy):
```bash
kubectl logs job/skillai-migrate -n skillai
```

### Scale the node group

To bump from t4g.small to t4g.medium (if OOM), update `TF_VAR_node_instance_type` in `.envrc` and re-run:
```bash
infra/scripts/10-terraform-apply.sh
```

Terraform will replace the node group nodes with a rolling update. The EKS pod will reschedule automatically.

### Check AWS costs

```bash
aws ce get-cost-and-usage \
  --time-period Start=$(date -d '-30 days' +%Y-%m-%d),End=$(date +%Y-%m-%d) \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --region us-east-1     # Cost Explorer API is always us-east-1
```

Expected: ~$5/day after the first 48h, ~$150/month total. See section 9 for cost breakdown.

### Restart the app (without re-deploying)

```bash
kubectl rollout restart deployment/skillai-app -n skillai
kubectl rollout status  deployment/skillai-app -n skillai
```

### Force cert renewal (if cert is stuck)

```bash
kubectl delete certificate skillai-tls -n skillai
# cert-manager recreates it automatically within ~60s
kubectl get certificate -n skillai -w
```

### View cert-manager logs (for ACME debugging)

```bash
kubectl logs deployment/cert-manager -n cert-manager --tail=50
```

---

## 7. Tear-Down

### Deletion safety (issue #247)

Both the RDS instance and the EFS filesystem are protected against accidental deletion:

- `deletion_protection = true` on the RDS instance prevents AWS from deleting it via the console or API without first disabling this flag.
- `lifecycle { prevent_destroy = true }` on both `aws_db_instance.main` and `aws_efs_file_system.uploads` prevents a plain `terraform destroy` from removing them without an explicit override.

### Default path — final snapshot taken

```bash
infra/scripts/destroy.sh
```

The script prompts twice for confirmation, then proceeds through a two-phase destroy:

1. Empties the ECR repository (Terraform cannot delete a non-empty ECR repo).
2. Writes a temporary `override_prevent_destroy.tf.json` file to remove the `prevent_destroy` lifecycle constraints (this file is gitignored and never committed).
3. Runs a targeted `terraform apply -target=aws_db_instance.main` with `skip_final_snapshot=false` to disable `deletion_protection` while keeping the snapshot behaviour intact.
4. Runs `terraform destroy`. Before the RDS instance is deleted, AWS automatically creates a **final snapshot** named `skillai-db-final-<YYYYMMDD-hhmm>`. This snapshot is recoverable from the AWS RDS console under Manual Snapshots.
5. Removes the temporary override file.

The EFS filesystem is **not** automatically snapshotted. If you need to preserve uploaded CVs, run `infra/scripts/70-uploads-sync.sh` to pull files to local disk before starting the destroy.

After destroy completes, a reminder is printed with the snapshot name. Delete it in the RDS console once you have confirmed data is no longer needed (it incurs minimal storage charges while retained).

### Force path — skip snapshot (data loss, dev/throwaway only)

Use this only for non-production environments where data loss is acceptable:

```bash
FORCE_DESTROY=1 infra/scripts/destroy.sh
# or
infra/scripts/destroy.sh --force
```

When `FORCE_DESTROY=1` is set:
- `skip_final_snapshot` is set to `true` via `-var force_destroy=true`.
- No RDS snapshot is created; all database data is permanently deleted.
- `deletion_protection` is disabled before the destroy.
- The `prevent_destroy` override is still applied so the destroy can proceed.

### Manual backup before destroy (recommended)

Regardless of which path you take, a manual pg_dump is the safest backup:

```bash
# Do NOT inline PGPASSWORD in the command — it gets written verbatim to shell history.
read -rs PGPASSWORD; export PGPASSWORD
pg_dump -h $(cd infra/terraform && terraform output -raw rds_endpoint) \
  -U skillai -d skillai \
  --format=custom --compress=9 \
  --file=/tmp/skillai-$(date +%Y%m%d-%H%M).dump
unset PGPASSWORD
```

After destroy, billing stops immediately for most resources. NAT Gateway and NLB stop accruing charges as soon as they are deleted. EKS control plane ($73/mo) stops at the end of the current hour.

---

## 8. Troubleshooting

### TLS cert pending / browser shows "not secure"

cert-manager issues the certificate via ACME HTTP-01, which requires:
1. The NGINX ingress to be reachable on port 80 from the internet
2. The Let's Encrypt server to reach `http://<host>/.well-known/acme-challenge/<token>`

Check cert status:
```bash
kubectl describe certificate skillai-tls -n skillai
kubectl describe certificaterequest -n skillai
kubectl describe challenge -n skillai  # if a challenge exists
```

Check cert-manager logs:
```bash
kubectl logs deployment/cert-manager -n cert-manager --tail=100
```

Common causes:
- NLB security group blocking port 80 — check the Terraform SG rules allow 0.0.0.0/0:80
- ClusterIssuer not yet created — re-run `30-platform-install.sh`
- nip.io DNS not resolving to the correct IP — verify `dig +short <host>` matches the NLB IP

### Pod CrashLoopBackOff

```bash
kubectl describe pod -l app=skillai-app -n skillai
kubectl logs -l app=skillai-app -n skillai --previous
```

Most common causes:
1. `DATABASE_URL` not reachable: the RDS security group must allow ingress from the EKS node security group on port 5432. Check Terraform `rds.tf` security group rules.
2. Secret not rendered correctly: re-run `50-render-secret.sh` and `80-deploy.sh`.
3. `ENCRYPTION_KEY` mismatch: app decrypts tenant settings on startup; wrong key causes a startup crash. Verify key matches `.env.local`.
4. Out of memory on t4g.small (2 GB): check `kubectl top pod -n skillai`. Bump to t4g.medium if needed.

### Migrate job fails

```bash
kubectl logs job/skillai-migrate -n skillai
```

Common causes:
1. **Drizzle journal out of sync**: the journal at `drizzle/` must include all migration files checked into the repo. If you see "journal entry not found", the image may not have the latest migrations — rebuild and push.
2. **pgvector extension missing**: the migrate script runs `CREATE EXTENSION IF NOT EXISTS vector` before Drizzle. If this fails, the RDS instance may not have the pgvector extension available. Verify you are using a `postgres:17` parameter group (pgvector ships with RDS Aurora PostgreSQL 14+ and standard PostgreSQL 14+ on RDS).
3. **RDS unreachable**: the migrate pod runs in the `skillai` namespace; RDS is in a private subnet. Verify the EKS node security group is allowed inbound on port 5432 in the RDS security group.

### 502 Bad Gateway from ingress

The NGINX ingress passes requests to the `skillai-app` Service. A 502 means NGINX can reach the ingress but the backend pods are not ready.

```bash
kubectl get endpoints skillai-app -n skillai    # should show pod IP:3000
kubectl get pods -n skillai -l app=skillai-app   # should be Running + Ready
```

If endpoints are empty:
- The pod may still be starting (startup probe takes up to 60s on t4g.small)
- The Service selector may not match the deployment labels — check `service.yaml`

### ECR authentication failure in 40-push-image.sh

```
no basic auth credentials
```

The ECR login token expires after 12 hours. Re-run `40-push-image.sh` — it re-authenticates at the start.

### NLB IP not resolving via dig

AWS NLBs provisioned for EKS NGINX return a hostname (not an IP directly). The hostname resolves via DNS to one or more EIPs. If `dig +short <nlb-hostname>` is empty:
- The NLB may still be provisioning (2-5 min after NGINX install)
- Check: `kubectl get svc ingress-nginx-controller -n ingress-nginx`

### t4g.small out of memory (OOM)

The t4g.small has 2 GB RAM. Under peak load (cert-manager + EFS CSI + NGINX + SkillAi app), this can be tight.

Signs: `kubectl describe pod` shows `OOMKilled`.

Fix: bump to t4g.medium:
1. Add to `.envrc`: `export TF_VAR_node_instance_type="t4g.medium"`
2. Re-run `infra/scripts/10-terraform-apply.sh`

Cost impact: +~$8/mo (t4g.medium = $23/mo vs t4g.small = $15/mo).

---

## 9. Cost Reference

| Line item | Monthly (est.) |
|---|---|
| EKS control plane | $73.00 |
| 1x t4g.small node (on-demand, 24/7) | $15.00 |
| RDS db.t4g.micro single-AZ (20GB gp3) | $13.00 |
| NLB (1 hour-rate + minimal LCU) | $16.00 |
| NAT Gateway (24/7 + data processed) | $32.00 |
| EFS (10-100 MB stored) | $0.30 |
| Data transfer out | $1.00 |
| ECR storage | $0.10 |
| **Total** | **~$150/mo** |

The plan originally targeted $80/mo. The realistic floor with NLB + NAT is ~$150/mo. To reach $80/mo you would need to eliminate the NAT ($32/mo) and NLB ($16/mo), which requires routing through Cloudflare Tunnel (no NLB) and using VPC Interface Endpoints for ECR/S3 only (no NAT for public internet). This is architecturally more complex and out of scope for this plan.

The single largest avoidable cost is the **NAT Gateway** ($32/mo). It is required for Anthropic and Gemini API egress. If you ever switch to a model accessible via AWS Bedrock, the NAT cost could be eliminated.

---

## 10. Architecture Notes

### Why nip.io instead of a real domain

nip.io is a wildcard DNS service that resolves `<ip>.nip.io` to `<ip>`. It enables a valid Let's Encrypt cert without purchasing a domain or managing DNS records. For a production deployment with a real domain, update `NEXTAUTH_URL` and the ingress host to use your domain and point an A record at the NLB IP.

### Why arm64 (t4g) not amd64

Graviton (t4g) nodes cost ~30% less than comparable x86 (t3) nodes for the same RAM/CPU. The Next.js app runs fine on arm64. The `docker buildx --platform linux/arm64` build in `40-push-image.sh` produces the correct image. Your local development docker-compose is unchanged (it uses the host architecture).

### Placeholder substitution approach in 80-deploy.sh

The `__ECR_REPO__`, `__IMAGE_TAG__`, and `__INGRESS_HOST__` placeholders in the kustomize files are substituted by `80-deploy.sh` into **temporary copies** of the files — the originals are never modified. This keeps the committed kustomize manifests clean (no git churn on every deploy) while still allowing dynamic values per deploy. This was chosen over `kustomize edit set image` because it also handles the ingress host substitution in the same pass.

### Terraform output contract with k8s-manifests agent

The infra scripts depend on these exact Terraform output names:
- `cluster_name` — EKS cluster name
- `rds_endpoint` — RDS hostname (no port)
- `rds_port` — RDS port (default 5432)
- `rds_database` — database name
- `rds_username` — DB username
- `rds_password` — DB password (sensitive)
- `efs_id` — EFS filesystem ID
- `ecr_repository_url` — full ECR URL including registry host

If the Terraform agent changes these output names, update the corresponding `terraform output -raw <name>` calls in the scripts.

### Drizzle migrate script

`60-db-migrate.sh` Phase A runs `node /app/scripts/migrate.mjs` inside the app container. This assumes the migrate script exists at that path inside the image. Verify:
```bash
docker run --rm --entrypoint ls <ecr-url>:<tag> /app/scripts/
```

If the migrate script has a different path or name in your Dockerfile, update the `--command` argument in `60-db-migrate.sh`.
