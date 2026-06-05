# AWS deployment

_Reference architecture for deploying SkillAI on AWS EKS — RDS for Postgres, EFS for uploads, NLB + cert-manager for TLS._

This is the trimmed reference for an AWS EKS deployment. The full runbook with every script, recovery procedure, and troubleshooting table lives at [`docs/aws-deploy.md`](https://github.com/olafkfreund/SkillAi/blob/core-mvp-foundation/docs/aws-deploy.md) in the repo — read it before doing a real deploy.

Target: small production, eu-west-2 (London), ~$150/mo realistic cost.

## Target architecture

```
                Internet
                    │
                    ▼
        AWS Network Load Balancer (NLB)
                    │
                    ▼
        NGINX Ingress + cert-manager
        (Let's Encrypt via ACME HTTP-01)
                    │
                    ▼
        EKS skillai (1x t4g.small node)
                    │
        ┌───────────┴────────────┐
        ▼                        ▼
   RDS PostgreSQL 17        EFS filesystem
   db.t4g.micro             (mounted at /app/uploads)
   pgvector enabled         RWX, single AZ
   private subnet           single AZ
```

What you get:

- **EKS** for the application (1× `t4g.small` Graviton node by default).
- **RDS PostgreSQL 17** (`db.t4g.micro`) with pgvector enabled, in a private subnet.
- **EFS** for the `/app/uploads` volume — appears as a normal POSIX filesystem, no code changes vs the Docker volume layout.
- **NLB** in front of NGINX Ingress for TLS termination.
- **cert-manager** managing TLS certs via Let's Encrypt.
- **ECR** for the container image (`linux/arm64` for Graviton).
- **NAT Gateway** for outbound Anthropic / Gemini API calls (private subnet → internet).

The Terraform that provisions all of this lives in `infra/terraform/`; the helper scripts that drive it sit in `infra/scripts/`.

## Prerequisites

| Tool | Min version |
|---|---|
| `aws` CLI | 2.15 |
| `kubectl` | 1.30 |
| `terraform` | 1.7 |
| `helm` | 3.14 |
| `direnv` | 2.x |
| `docker` (with buildx) | 24+ |
| `psql` | 15+ |

AWS account permissions for: EKS, RDS, EFS, ECR, EC2 (VPC, subnets, NAT, NLB), IAM (OIDC provider, IRSA roles).

## Secrets management

Two secrets are load-bearing:

- **`ENCRYPTION_KEY`** — encrypts per-tenant AI API keys stored in `tenant_settings` using AES-256-GCM. **If you deploy a different value than your local one, every tenant's stored keys become unreadable.** The `50-render-secret.sh` script asserts that `.envrc` matches `.env.local` and refuses to proceed otherwise.
- **`AUTH_SECRET`** — JWT signing key. Changing it invalidates every active session.

Set both in `.envrc` (project-local, gitignored). For real production, layer **AWS Secrets Manager** in front: store the values there, inject into the EKS deployment via the External Secrets Operator or the Secrets Store CSI driver. The Terraform module supports both wiring patterns; pick one for your security model.

All other secrets (`ANTHROPIC_API_KEY`, RDS password, etc.) live in `.envrc` and get rendered into a Kubernetes `Secret` by `infra/scripts/50-render-secret.sh`. The rendered `secret.yaml` is gitignored — never commit it.

## Required env vars in `.envrc`

| Variable | Notes |
|---|---|
| `AWS_PROFILE` | Or use access-key pair. |
| `AWS_REGION` | `eu-west-2` for the default Terraform config. |
| `ENCRYPTION_KEY` | **Verbatim copy** of your local `.env.local` value. |
| `AUTH_SECRET` | Same. |
| `ANTHROPIC_API_KEY` | Anthropic key. |
| `TF_VAR_allowed_operator_cidrs` | Restricts EKS public API endpoint to your IPs. `["X.X.X.X/32"]` — required, Terraform refuses to apply if empty. |
| `NEXTAUTH_URL` / `APP_URL` / `NEXT_PUBLIC_APP_URL` | Set after the NLB is provisioned (step 4). |

## Deploy pipeline

```bash
# 1. Preflight — verify all tools + env vars
infra/scripts/00-preflight.sh

# 2. Bootstrap Terraform state (ONCE per AWS account — creates S3 bucket + lock table)
infra/scripts/05-state-bootstrap.sh

# 3. Provision AWS infrastructure (18-25 minutes)
infra/scripts/10-terraform-apply.sh

# 4. Wire kubeconfig + install platform components (EFS CSI, NGINX Ingress, cert-manager)
infra/scripts/20-kubeconfig.sh
infra/scripts/30-platform-install.sh
# Note the NLB IP printed at the end. Set NEXTAUTH_URL / APP_URL in .envrc to that IP.nip.io.

# 5. Build + push the arm64 image
infra/scripts/40-push-image.sh

# 6. Render the Kubernetes Secret + deploy
infra/scripts/50-render-secret.sh
infra/scripts/80-deploy.sh

# 7. Verify
infra/scripts/90-verify.sh
```

### Step 3 — what Terraform provisions

- VPC `10.10.0.0/16`, 2 public + 2 private subnets across 2 AZs
- NAT Gateway in `eu-west-2a` (required for Anthropic/Gemini egress)
- EKS cluster `skillai` v1.30 with 1× `t4g.small` managed node
- RDS PostgreSQL 17, `db.t4g.micro`, 20 GB gp3, single-AZ, private subnet
- EFS filesystem for uploads (RWX, single AZ)
- ECR repository `skillai`
- IAM: OIDC provider, IRSA roles for the EFS CSI driver
- KMS envelope encryption for Kubernetes Secrets in etcd

### Step 6 — what the deploy script does

`infra/scripts/80-deploy.sh`:

1. Substitutes `__ECR_REPO__`, `__IMAGE_TAG__`, `__INGRESS_HOST__` into temporary copies of the kustomize files (originals untouched).
2. Applies `infra/k8s/overlays/prod` — includes the rendered Secret, deployment, service, ingress, and PVC.
3. Waits for the `skillai-migrate` Job to complete (runs Drizzle migrations against RDS, plus `CREATE EXTENSION IF NOT EXISTS vector`).
4. Waits for the deployment rollout.
5. Prints the ingress URL.

## Migrating data from local on first deploy

Skip this if you're starting fresh in production.

```bash
infra/scripts/60-db-migrate.sh    # Phase A: schema, Phase B: data via pg_dump + pg_restore
infra/scripts/70-uploads-sync.sh  # rsync ./uploads/ into the EFS PVC
```

Phase B is **not idempotent**. If it fails partway through, truncate all tables before re-running — full procedure in the source runbook.

## Rolling updates (day 2)

```bash
infra/scripts/40-push-image.sh   # build + push new image
infra/scripts/80-deploy.sh       # apply new image to cluster
```

With 1 replica there's a ~30 s downtime window during pod replacement. For zero-downtime, bump `replicas: 2` in `deployment.yaml` and scale the node group to `min=2`.

## Cost reference

| Line item | Monthly |
|---|---:|
| EKS control plane | $73 |
| 1× t4g.small node (on-demand, 24/7) | $15 |
| RDS db.t4g.micro single-AZ (20 GB gp3) | $13 |
| NLB (1 hour-rate + minimal LCU) | $16 |
| NAT Gateway (24/7 + data processed) | $32 |
| EFS (10–100 MB stored) | $0.30 |
| Data transfer out | $1 |
| ECR storage | $0.10 |
| **Total** | **~$150** |

The largest avoidable cost is the **NAT Gateway** (~$32/mo), required for Anthropic / Gemini API egress. If you ever route LLM calls through AWS Bedrock, the NAT cost could be eliminated.

## Tear-down

`infra/scripts/destroy.sh` runs a two-phase destroy:

1. **Cluster-side teardown** — deletes the `skillai` namespace (releases EBS PVCs), uninstalls NGINX (releases the NLB), uninstalls cert-manager, waits up to 90 s for NLB ENIs to drain.
2. **Terraform destroy** — empties ECR, writes a temporary `prevent_destroy` override, takes a final RDS snapshot named `skillai-db-final-<YYYYMMDD-hhmm>`, then tears down everything else.

The EFS filesystem is **not** auto-snapshotted. Pull uploaded files with `infra/scripts/70-uploads-sync.sh` before destroying if you need them.

For dev / throwaway environments where data loss is acceptable: `FORCE_DESTROY=1 infra/scripts/destroy.sh` skips the snapshot.

## Architecture notes

- **Why `nip.io` instead of a real domain** — `nip.io` is wildcard DNS that resolves `<ip>.nip.io` to `<ip>`. Enables a valid Let's Encrypt cert without buying a domain. For a real deployment, swap `NEXTAUTH_URL` and the ingress host to your domain and point an A record at the NLB.
- **Why arm64 (`t4g`) not amd64 (`t3`)** — Graviton is ~30% cheaper for the same RAM/CPU. The `docker buildx --platform linux/arm64` build produces the correct image. Local dev docker-compose still uses the host architecture.
- **EKS control plane audit logging** — enabled by Terraform, logs land in `/aws/eks/skillai/cluster` in CloudWatch with 90-day retention.

## Where to look in the source runbook

The full `docs/aws-deploy.md` covers in detail:

- **Recovery from mid-failure** for every script (idempotent vs not).
- **Troubleshooting** — TLS cert pending, CrashLoopBackOff, migrate job failures, 502 Bad Gateway, ECR auth failures, NLB IP not resolving, t4g.small OOM.
- **Specific Terraform output names** the scripts depend on.
- **The Drizzle migrate script path** and how to verify it inside the image.

Read it before a real production deploy. This page is the navigational summary.

## Related

- [Backup & recovery](./backup-runbook.md) — operator-level Postgres dump + uploads tarball procedure.
- [Health & monitoring](./health-monitoring.md) — `/api/health` endpoint shape and the audit log table.
- [File storage](../architecture/file-storage.md) — EFS in EKS works identically to the local Docker volume.
