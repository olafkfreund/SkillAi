#!/usr/bin/env -S just --justfile
# justfile — SkillAi ops command runner
#
# Usage:   just <recipe>          (from repo root, with direnv active)
# Prereqs: direnv active (run: direnv allow) so .envrc is sourced
#          Tools: aws-cli >=2.15, kubectl >=1.30, terraform >=1.7, helm >=3.14
#
# Cost reference (eu-west-2, as of plan purrfect-percolating-mango):
#   RUNNING : ~$150/mo  (EKS $73 + node $15 + RDS $13 + NLB $16 + NAT $32 + EFS $1)
#   STOPPED : ~$122/mo  (EKS $73 + NLB $16 + NAT $32 + EFS $1 + RDS storage ~$0.30)
#   SAVINGS : ~$28/mo   (node $15 + RDS compute $13 = $28)
#
# Note: EKS control plane ($73/mo) is always billed — it cannot be stopped.
#       NLB is kept running to preserve the static IP and TLS certificate.
#       Stopping the NLB would release the IP and break the nip.io hostname.

# ---------------------------------------------------------------------------
# Global settings
# ---------------------------------------------------------------------------

# Do NOT use set dotenv-load — .envrc is bash syntax, not dotenv syntax.
# Rely on direnv being active in the operator's shell. If you see errors like
# "AWS_REGION: unbound variable", run: direnv allow
set shell := ["bash", "-euo", "pipefail", "-c"]

# Terraform state directory (relative to repo root)
tf_dir := "infra/terraform"

# Kubernetes namespace for all SkillAi resources
k8s_ns := "skillai"

# Kubernetes deployment name
k8s_deploy := "skillai-app"

# ---------------------------------------------------------------------------
# Default: show help
# ---------------------------------------------------------------------------

# Show this help (all available recipes)
default:
    @just --list

# ---------------------------------------------------------------------------
# === Local dev (docker-compose) ===
# ---------------------------------------------------------------------------

# Start the local docker-compose stack (app + postgres)
dev:
    docker compose up -d

# Stop the local docker-compose stack
dev-down:
    docker compose down

# Follow live logs from the app container
dev-logs:
    docker compose logs -f app

# Open a shell inside the running local app container
dev-shell:
    docker exec -it skillai-app-1 sh

# ---------------------------------------------------------------------------
# === AWS one-time bootstrap (run in order on first deploy) ===
# ---------------------------------------------------------------------------

# [1/4] Check all required tools and AWS credentials are ready
preflight:
    bash infra/scripts/00-preflight.sh

# [2/4] Provision VPC, EKS cluster, RDS, EFS, ECR via Terraform (takes ~15 min)
tf-apply:
    bash infra/scripts/10-terraform-apply.sh

# [3/4] Update local kubeconfig to point at the new EKS cluster
kubeconfig:
    bash infra/scripts/20-kubeconfig.sh

# [4/4] Install NGINX ingress, cert-manager, EFS CSI driver onto the cluster
platform-install:
    bash infra/scripts/30-platform-install.sh

# Full first-time bootstrap: runs preflight → tf-apply → kubeconfig → platform-install
bootstrap: preflight tf-apply kubeconfig platform-install
    @echo ""
    @echo "Bootstrap complete. Next steps:"
    @echo "  1. just image-push      # build and push the ARM64 image to ECR"
    @echo "  2. just migrate-all     # copy local DB + uploads to AWS (one-shot)"
    @echo "  3. just deploy          # render secret + apply k8s manifests + verify"

# ---------------------------------------------------------------------------
# === Build + deploy ===
# ---------------------------------------------------------------------------

# Build arm64 image and push to ECR (tags both :sha-<short> and :latest)
image-push:
    bash infra/scripts/40-push-image.sh

# Render .envrc → infra/k8s/base/secret.yaml (gitignored; local only)
render-secret:
    bash infra/scripts/50-render-secret.sh

# Full deploy: render secret + push image + apply k8s manifests + verify health
deploy: render-secret image-push
    bash infra/scripts/80-deploy.sh
    bash infra/scripts/90-verify.sh

# ---------------------------------------------------------------------------
# === Data migration (one-shot, first deploy only) ===
# ---------------------------------------------------------------------------

# Run Drizzle migrations on RDS and restore local Postgres dump (one-shot)
db-migrate:
    bash infra/scripts/60-db-migrate.sh

# Sync local ./uploads/ directory to EFS via a helper pod (one-shot)
uploads-sync:
    bash infra/scripts/70-uploads-sync.sh

# Full migration: db-migrate + uploads-sync (run once after first deploy)
migrate-all: db-migrate uploads-sync
    @echo ""
    @echo "Migration complete. Run 'just deploy' to bring up the application."

# ---------------------------------------------------------------------------
# === Cluster lifecycle (start / stop to save money overnight) ===
# ---------------------------------------------------------------------------

# Scale EKS node group to 0 + stop RDS (~$28/mo savings; EKS control plane stays billed)
stop:
    #!/usr/bin/env bash
    set -euo pipefail

    # Derive values from terraform output (requires terraform to have been applied)
    TF_DIR="$(pwd)/infra/terraform"
    if [[ ! -f "${TF_DIR}/terraform.tfstate" && ! -f "${TF_DIR}/.terraform/terraform.tfstate" ]]; then
      # Try remote state as well — if no state at all, fail clearly
      if ! (cd "${TF_DIR}" && terraform output -raw cluster_name 2>/dev/null); then
        echo "ERROR: Terraform state not found. Has 'just tf-apply' been run?"
        echo "       If using remote state, ensure you are authenticated."
        exit 1
      fi
    fi

    CLUSTER_NAME=$(cd "${TF_DIR}" && terraform output -raw cluster_name 2>/dev/null)
    REGION=$(cd "${TF_DIR}" && terraform output -raw region 2>/dev/null)
    # RDS identifier is deterministic: <project>-db (see infra/terraform/rds.tf)
    # terraform outputs rds_endpoint (hostname) not the identifier — derive it:
    RDS_IDENTIFIER="${CLUSTER_NAME}-db"
    # Node group name is <project>-ng (see infra/terraform/eks.tf node group key)
    NODEGROUP="${CLUSTER_NAME}-ng"

    echo "=== SkillAi cluster STOP ==="
    echo "Cluster:    ${CLUSTER_NAME}"
    echo "Region:     ${REGION}"
    echo "Node group: ${NODEGROUP}"
    echo "RDS:        ${RDS_IDENTIFIER}"
    echo ""

    # --- Scale node group to 0 ---
    CURRENT_DESIRED=$(aws eks describe-nodegroup \
      --cluster-name "${CLUSTER_NAME}" \
      --nodegroup-name "${NODEGROUP}" \
      --region "${REGION}" \
      --query 'nodegroup.scalingConfig.desiredSize' \
      --output text 2>/dev/null || echo "UNKNOWN")

    if [[ "${CURRENT_DESIRED}" == "0" ]]; then
      echo "[nodes] Already at 0 replicas — skipping scale-down."
    else
      echo "[nodes] Scaling node group from ${CURRENT_DESIRED} → 0..."
      aws eks update-nodegroup-config \
        --cluster-name "${CLUSTER_NAME}" \
        --nodegroup-name "${NODEGROUP}" \
        --region "${REGION}" \
        --scaling-config minSize=0,desiredSize=0,maxSize=2
      echo "[nodes] Scale-down requested. Nodes will terminate in 2-4 minutes."
    fi

    # --- Stop RDS (AWS auto-starts after 7 days; storage charges continue) ---
    RDS_STATUS=$(aws rds describe-db-instances \
      --db-instance-identifier "${RDS_IDENTIFIER}" \
      --region "${REGION}" \
      --query 'DBInstances[0].DBInstanceStatus' \
      --output text 2>/dev/null || echo "NOT_FOUND")

    if [[ "${RDS_STATUS}" == "stopped" || "${RDS_STATUS}" == "stopping" ]]; then
      echo "[rds]   Already ${RDS_STATUS} — skipping."
    elif [[ "${RDS_STATUS}" == "NOT_FOUND" ]]; then
      echo "[rds]   WARNING: RDS instance '${RDS_IDENTIFIER}' not found. Skipping."
    else
      echo "[rds]   Stopping RDS instance (status: ${RDS_STATUS})..."
      aws rds stop-db-instance \
        --db-instance-identifier "${RDS_IDENTIFIER}" \
        --region "${REGION}"
      echo "[rds]   Stop requested. RDS will be stopped in ~2 minutes."
    fi

    echo ""
    echo "Estimated monthly savings: ~\$28/mo (node \$15 + RDS compute \$13)"
    echo "EKS control plane continues at \$73/mo regardless."
    echo "NLB stays up to preserve static IP + TLS cert."
    echo ""
    echo "To restart: just start"

# Bring EKS node group + RDS back up (~5-8 min total)
start: _assert-context
    #!/usr/bin/env bash
    set -euo pipefail

    TF_DIR="$(pwd)/infra/terraform"
    CLUSTER_NAME=$(cd "${TF_DIR}" && terraform output -raw cluster_name 2>/dev/null || { echo "ERROR: Run 'just tf-apply' first."; exit 1; })
    REGION=$(cd "${TF_DIR}" && terraform output -raw region 2>/dev/null)
    RDS_IDENTIFIER="${CLUSTER_NAME}-db"
    NODEGROUP="${CLUSTER_NAME}-ng"

    echo "=== SkillAi cluster START ==="
    echo "Cluster:    ${CLUSTER_NAME}"
    echo "Region:     ${REGION}"
    echo "Node group: ${NODEGROUP}"
    echo "RDS:        ${RDS_IDENTIFIER}"
    echo ""

    # --- Start RDS first (takes ~5 min; start it before nodes to parallelize) ---
    RDS_STATUS=$(aws rds describe-db-instances \
      --db-instance-identifier "${RDS_IDENTIFIER}" \
      --region "${REGION}" \
      --query 'DBInstances[0].DBInstanceStatus' \
      --output text 2>/dev/null || echo "NOT_FOUND")

    if [[ "${RDS_STATUS}" == "available" ]]; then
      echo "[rds]   Already available — skipping start."
    elif [[ "${RDS_STATUS}" == "NOT_FOUND" ]]; then
      echo "[rds]   WARNING: RDS instance '${RDS_IDENTIFIER}' not found. Has terraform been applied?"
    elif [[ "${RDS_STATUS}" == "starting" ]]; then
      echo "[rds]   Already starting — will wait below."
    else
      echo "[rds]   Starting RDS instance (current status: ${RDS_STATUS})..."
      aws rds start-db-instance \
        --db-instance-identifier "${RDS_IDENTIFIER}" \
        --region "${REGION}"
      echo "[rds]   Start requested."
    fi

    # --- Scale node group back to desired=1 ---
    CURRENT_DESIRED=$(aws eks describe-nodegroup \
      --cluster-name "${CLUSTER_NAME}" \
      --nodegroup-name "${NODEGROUP}" \
      --region "${REGION}" \
      --query 'nodegroup.scalingConfig.desiredSize' \
      --output text 2>/dev/null || echo "UNKNOWN")

    if [[ "${CURRENT_DESIRED}" != "0" && "${CURRENT_DESIRED}" != "UNKNOWN" ]]; then
      echo "[nodes] Node group already at desired=${CURRENT_DESIRED} — skipping scale-up."
    else
      echo "[nodes] Scaling node group to desired=1 (was ${CURRENT_DESIRED})..."
      aws eks update-nodegroup-config \
        --cluster-name "${CLUSTER_NAME}" \
        --nodegroup-name "${NODEGROUP}" \
        --region "${REGION}" \
        --scaling-config minSize=1,desiredSize=1,maxSize=2
      echo "[nodes] Scale-up requested."
    fi

    # --- Wait for RDS to become available (~5 min) ---
    echo "[rds]   Waiting for RDS to reach 'available' (up to 10 min)..."
    aws rds wait db-instance-available \
      --db-instance-identifier "${RDS_IDENTIFIER}" \
      --region "${REGION}"
    echo "[rds]   RDS is available."

    # --- Wait for at least 1 node to be Ready (~3 min after scale-up) ---
    echo "[nodes] Waiting for node to become Ready (up to 8 min)..."
    DEADLINE=$(( $(date +%s) + 480 ))
    while true; do
      READY_NODES=$(kubectl get nodes --no-headers 2>/dev/null | grep -c " Ready" || true)
      if [[ "${READY_NODES}" -ge 1 ]]; then
        echo "[nodes] ${READY_NODES} node(s) Ready."
        break
      fi
      if [[ $(date +%s) -gt ${DEADLINE} ]]; then
        echo "[nodes] WARNING: Timed out waiting for nodes. Check: aws eks describe-nodegroup ..."
        break
      fi
      echo "[nodes] Waiting... (ready: ${READY_NODES})"
      sleep 15
    done

    # --- Rollout restart deployment (picks up any secret changes) ---
    echo "[k8s]   Restarting deployment/${k8s_deploy} to pick up current secrets..."
    kubectl rollout restart deployment/{{ k8s_deploy }} -n {{ k8s_ns }} 2>/dev/null || \
      echo "[k8s]   WARNING: Could not restart deployment (may not be deployed yet)."
    kubectl rollout status deployment/{{ k8s_deploy }} -n {{ k8s_ns }} --timeout=120s 2>/dev/null || \
      echo "[k8s]   WARNING: Rollout status timed out."

    # --- Quick health check ---
    INGRESS_HOST=$(kubectl get ingress -n {{ k8s_ns }} -o jsonpath='{.items[0].spec.rules[0].host}' 2>/dev/null || echo "")
    if [[ -n "${INGRESS_HOST}" ]]; then
      echo "[health] Checking https://${INGRESS_HOST}/api/health ..."
      HEALTH=$(curl -sf --max-time 10 "https://${INGRESS_HOST}/api/health" 2>/dev/null || echo "unreachable")
      echo "[health] ${HEALTH}"
    else
      echo "[health] No ingress host found — skipping health check."
    fi

    echo ""
    echo "Cluster is back up. Run 'just status' for full state."

# ---------------------------------------------------------------------------
# === Cluster status + cost estimate ===
# ---------------------------------------------------------------------------

# Show node group, RDS, deployment, ingress, and /api/health in one view
status: _assert-context
    #!/usr/bin/env bash
    set -euo pipefail

    TF_DIR="$(pwd)/infra/terraform"
    if ! CLUSTER_NAME=$(cd "${TF_DIR}" && terraform output -raw cluster_name 2>/dev/null); then
      echo "Terraform state not found — cluster may not be provisioned yet."
      echo "Run: just tf-apply"
      exit 0
    fi
    REGION=$(cd "${TF_DIR}" && terraform output -raw region 2>/dev/null)
    RDS_IDENTIFIER="${CLUSTER_NAME}-db"
    NODEGROUP="${CLUSTER_NAME}-ng"

    echo "=== SkillAi cluster STATUS ($(date -u '+%Y-%m-%dT%H:%M:%SZ')) ==="
    echo ""

    # Node group
    echo "--- EKS Node Group: ${NODEGROUP} ---"
    aws eks describe-nodegroup \
      --cluster-name "${CLUSTER_NAME}" \
      --nodegroup-name "${NODEGROUP}" \
      --region "${REGION}" \
      --query 'nodegroup.{desired:scalingConfig.desiredSize,min:scalingConfig.minSize,max:scalingConfig.maxSize,status:status}' \
      --output table 2>/dev/null || echo "(unable to describe node group)"
    echo ""

    # RDS
    echo "--- RDS: ${RDS_IDENTIFIER} ---"
    aws rds describe-db-instances \
      --db-instance-identifier "${RDS_IDENTIFIER}" \
      --region "${REGION}" \
      --query 'DBInstances[0].{status:DBInstanceStatus,class:DBInstanceClass,az:AvailabilityZone}' \
      --output table 2>/dev/null || echo "(unable to describe RDS instance)"
    echo ""

    # Kubernetes deployment
    echo "--- Kubernetes: deployment/${k8s_deploy} (ns: ${k8s_ns}) ---"
    kubectl get deployment/{{ k8s_deploy }} -n {{ k8s_ns }} \
      --no-headers \
      -o custom-columns="NAME:.metadata.name,DESIRED:.spec.replicas,READY:.status.readyReplicas,AVAILABLE:.status.availableReplicas" \
      2>/dev/null || echo "(deployment not found — has 'just deploy' been run?)"
    echo ""

    # Ingress + TLS cert
    echo "--- Ingress + Certificate ---"
    kubectl get ingress -n {{ k8s_ns }} 2>/dev/null || echo "(no ingress found)"
    kubectl get certificate -n {{ k8s_ns }} 2>/dev/null || echo "(no certificate found)"
    echo ""

    # Health endpoint
    INGRESS_HOST=$(kubectl get ingress -n {{ k8s_ns }} -o jsonpath='{.items[0].spec.rules[0].host}' 2>/dev/null || echo "")
    echo "--- /api/health ---"
    if [[ -n "${INGRESS_HOST}" ]]; then
      curl -sf --max-time 10 "https://${INGRESS_HOST}/api/health" 2>/dev/null \
        | python3 -m json.tool 2>/dev/null \
        || echo "(health check failed or unreachable)"
    else
      echo "(no ingress host detected)"
    fi

# Print estimated monthly cost based on current cluster state
cost-estimate:
    #!/usr/bin/env bash
    set -euo pipefail

    TF_DIR="$(pwd)/infra/terraform"
    if ! CLUSTER_NAME=$(cd "${TF_DIR}" && terraform output -raw cluster_name 2>/dev/null); then
      echo "Terraform state not found. Cannot estimate cost."
      exit 0
    fi
    REGION=$(cd "${TF_DIR}" && terraform output -raw region 2>/dev/null)
    RDS_IDENTIFIER="${CLUSTER_NAME}-db"
    NODEGROUP="${CLUSTER_NAME}-ng"

    # Check node group desired count
    NODE_DESIRED=$(aws eks describe-nodegroup \
      --cluster-name "${CLUSTER_NAME}" \
      --nodegroup-name "${NODEGROUP}" \
      --region "${REGION}" \
      --query 'nodegroup.scalingConfig.desiredSize' \
      --output text 2>/dev/null || echo "UNKNOWN")

    # Check RDS status
    RDS_STATUS=$(aws rds describe-db-instances \
      --db-instance-identifier "${RDS_IDENTIFIER}" \
      --region "${REGION}" \
      --query 'DBInstances[0].DBInstanceStatus' \
      --output text 2>/dev/null || echo "UNKNOWN")

    echo "=== SkillAi cost estimate (eu-west-2, on-demand pricing) ==="
    echo ""
    echo "  EKS control plane (always billed):       \$73.00/mo"
    echo "  NLB (always up — preserves cert + IP):   \$16.00/mo"
    echo "  NAT gateway (always up — AI egress):     \$32.00/mo"
    echo "  EFS (10 MB stored):                      \$ 0.30/mo"
    echo ""

    if [[ "${NODE_DESIRED}" == "0" ]]; then
      echo "  EKS t4g.small node (STOPPED):           \$ 0.00/mo"
    else
      echo "  EKS t4g.small node (RUNNING, x${NODE_DESIRED}):     \$15.00/mo (x${NODE_DESIRED})"
    fi

    if [[ "${RDS_STATUS}" == "stopped" || "${RDS_STATUS}" == "stopping" ]]; then
      echo "  RDS db.t4g.micro (STOPPED, storage):   \$ 0.30/mo"
    else
      echo "  RDS db.t4g.micro (RUNNING):             \$13.00/mo"
    fi

    echo ""
    if [[ "${NODE_DESIRED}" == "0" && ("${RDS_STATUS}" == "stopped" || "${RDS_STATUS}" == "stopping") ]]; then
      echo "  Cluster is STOPPED."
      echo "  Estimated monthly cost: ~\$122/mo (control plane + NLB + NAT + storage)"
      echo "  Potential savings vs running: ~\$28/mo"
      echo ""
      echo "  Run 'just start' to bring it back up."
    else
      echo "  Cluster is RUNNING."
      echo "  Estimated monthly cost: ~\$150/mo"
      echo ""
      echo "  Run 'just stop' to save ~\$28/mo overnight or on weekends."
    fi
    echo ""
    echo "  Note: Actual costs vary with data transfer and exact usage hours."
    echo "  Reference: plan purrfect-percolating-mango.md for line-item breakdown."

# ---------------------------------------------------------------------------
# === Private helpers ===
# ---------------------------------------------------------------------------

# Assert kubectl context matches expected EKS cluster ARN (prevents fat-finger cluster ops)
[private]
_assert-context:
    #!/usr/bin/env bash
    set -euo pipefail
    : "${AWS_REGION:?AWS_REGION must be set (source .envrc)}"
    account=$(aws sts get-caller-identity --query Account --output text 2>/dev/null) || {
        echo "ERROR: aws sts get-caller-identity failed — is AWS_PROFILE / .envrc set?" >&2
        exit 1
    }
    expected="arn:aws:eks:${AWS_REGION}:${account}:cluster/${CLUSTER_NAME:-skillai}"
    actual=$(kubectl config current-context 2>/dev/null) || {
        echo "ERROR: no current kubectl context — run 'just kubeconfig' first" >&2
        exit 1
    }
    if [[ "$actual" != "$expected" ]]; then
        echo "ERROR: kubectl context is '$actual', expected '$expected'" >&2
        echo "Run: aws eks update-kubeconfig --region $AWS_REGION --name ${CLUSTER_NAME:-skillai}" >&2
        exit 1
    fi

# ---------------------------------------------------------------------------
# === Quality of life ===
# ---------------------------------------------------------------------------

# Run the 90-verify.sh script (curl health + kubectl get all + cert status)
verify:
    bash infra/scripts/90-verify.sh

# Follow live application logs from the Kubernetes deployment (last 100 lines)
logs: _assert-context
    kubectl logs deployment/{{ k8s_deploy }} -n {{ k8s_ns }} --tail=100 -f

# Open an interactive shell in the running app pod
shell: _assert-context
    kubectl exec -it deployment/{{ k8s_deploy }} -n {{ k8s_ns }} -- sh

# Forward local :3000 → cluster :80 to test without going through ingress
port-forward: _assert-context
    kubectl port-forward -n {{ k8s_ns }} svc/{{ k8s_deploy }} 3000:80

# ---------------------------------------------------------------------------
# === Cleanup ===
# ---------------------------------------------------------------------------

# Destroy ALL AWS infrastructure — IRREVERSIBLE; script requires double confirmation
destroy:
    bash infra/scripts/destroy.sh
