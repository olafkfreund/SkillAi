#!/usr/bin/env bash
# infra/scripts/destroy.sh
# Tear down ALL AWS resources created by this project.
#
# IMPORTANT — DELETION SAFETY (issue #247)
# =========================================
# Both the RDS instance and the EFS filesystem now have:
#   - deletion_protection = true   (RDS — blocks AWS-level deletion)
#   - lifecycle { prevent_destroy = true }  (Terraform — blocks plan/apply destroy)
#
# DEFAULT BEHAVIOUR (safe path)
# --------------------------------
# terraform destroy will be blocked by prevent_destroy.  This script performs a
# two-phase destroy:
#   Phase A: targeted apply that sets skip_final_snapshot=false, which causes RDS
#            to take a FINAL SNAPSHOT before the instance is deleted.  The snapshot
#            name includes a timestamp and appears in the AWS RDS console under
#            "Manual snapshots".  The EFS data is NOT automatically backed up —
#            run 70-uploads-sync.sh to pull files before proceeding if needed.
#   Phase B: terraform destroy after the prevent_destroy constraints have been
#            removed by temporarily overriding the Terraform source.
#
# FORCE PATH (data loss — use only for dev/throwaway environments)
# ----------------------------------------------------------------
#   FORCE_DESTROY=1 ./destroy.sh
# or
#   ./destroy.sh --force
#
# When FORCE_DESTROY=1:
#   - skip_final_snapshot is set to true via -var force_destroy=true
#   - The script still prompts for confirmation but skips the final snapshot
#   - lifecycle.prevent_destroy is removed via a temporary override file
#   - deletion_protection is disabled via a targeted apply before destroy
#
# NOTE ON lifecycle.prevent_destroy
# ----------------------------------
# Terraform does not allow lifecycle.prevent_destroy to be driven by a variable.
# This script works around that by writing a temporary override file
# (override_prevent_destroy.tf.json) that replaces the lifecycle block with
# prevent_destroy=false, runs the destroy, then removes the override.
# The override file is gitignored — it must never be committed.
#
# WARNING: This is irreversible. It will delete:
#   - EKS cluster (all workloads, PVCs, etc.)
#   - RDS PostgreSQL instance (ALL candidate data — snapshot taken unless --force)
#   - EFS filesystem (ALL uploaded CVs — not automatically snapshotted)
#   - ECR repository (ALL images)
#   - VPC, subnets, NAT, NLB
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TF_DIR="${REPO_ROOT}/infra/terraform"
OVERRIDE_FILE="${TF_DIR}/override_prevent_destroy.tf.json"

# shellcheck source=/dev/null
eval "$(direnv export bash 2>/dev/null)" || source "${REPO_ROOT}/.envrc"

log() { echo "[destroy] $(date -u +%H:%M:%SZ) $*"; }

PROJECT_NAME="skillai"
REGION="${AWS_REGION:-eu-west-2}"

# ---------------------------------------------------------------------------
# Parse flags
# ---------------------------------------------------------------------------
FORCE_DESTROY="${FORCE_DESTROY:-0}"
for arg in "$@"; do
  case "${arg}" in
    --force) FORCE_DESTROY=1 ;;
    *) ;;
  esac
done

command -v terraform &>/dev/null || { echo "[destroy] ERROR: terraform not found."; exit 1; }
command -v aws       &>/dev/null || { echo "[destroy] ERROR: aws-cli not found."; exit 1; }

# ---------------------------------------------------------------------------
# Cost warning + snapshot notice
# ---------------------------------------------------------------------------
echo ""
echo "[destroy] ============================================================"
echo "[destroy]  WARNING: DESTRUCTIVE OPERATION"
echo "[destroy] ============================================================"
echo "[destroy]"
echo "[destroy]  You are about to PERMANENTLY DELETE all AWS resources for"
echo "[destroy]  the '${PROJECT_NAME}' project in region '${REGION}'."
echo "[destroy]"
echo "[destroy]  This includes:"
echo "[destroy]    - EKS cluster and all running workloads"
echo "[destroy]    - RDS PostgreSQL instance (ALL candidate data!)"
echo "[destroy]    - EFS filesystem (ALL uploaded CVs!)"
echo "[destroy]    - ECR repository and all container images"
echo "[destroy]    - VPC, NAT Gateway, NLB (billing stops immediately)"
echo "[destroy]"

if [[ "${FORCE_DESTROY}" == "1" ]]; then
  echo "[destroy]  !! FORCE MODE ACTIVE — final snapshot will be SKIPPED !!"
  echo "[destroy]  !! All data will be permanently lost. !!"
else
  echo "[destroy]  SNAPSHOT: A final RDS snapshot will be taken before deletion."
  echo "[destroy]    The snapshot will appear in the AWS RDS console under"
  echo "[destroy]    Manual Snapshots as:  ${PROJECT_NAME}-db-final-<timestamp>"
  echo "[destroy]    Keep or delete it manually after this script completes."
  echo "[destroy]"
  echo "[destroy]  EFS data is NOT automatically snapshotted. If you need to"
  echo "[destroy]  preserve uploaded CVs, run 70-uploads-sync.sh first."
fi

echo "[destroy]"
echo "[destroy] ============================================================"
echo ""

# ---------------------------------------------------------------------------
# First confirmation
# ---------------------------------------------------------------------------
read -r -p "[destroy] Type the project name '${PROJECT_NAME}' to confirm: " CONFIRM1
echo ""
if [[ "${CONFIRM1}" != "${PROJECT_NAME}" ]]; then
  echo "[destroy] Confirmation did not match '${PROJECT_NAME}'. Aborting."
  exit 1
fi

# ---------------------------------------------------------------------------
# Second confirmation
# ---------------------------------------------------------------------------
read -r -p "[destroy] Are you absolutely sure? Type 'destroy' to proceed: " CONFIRM2
echo ""
if [[ "${CONFIRM2}" != "destroy" ]]; then
  echo "[destroy] Second confirmation failed. Aborting."
  exit 1
fi

log "Proceeding with destroy ..."

# ---------------------------------------------------------------------------
# Resolve cluster name from Terraform state (needed for Phase 1 + post-verify)
# ---------------------------------------------------------------------------
CLUSTER_NAME=""
if [[ -d "${TF_DIR}" ]]; then
  CLUSTER_NAME="$(cd "${TF_DIR}" && terraform output -raw cluster_name 2>/dev/null || echo "")"
fi
if [[ -z "${CLUSTER_NAME}" ]]; then
  CLUSTER_NAME="${PROJECT_NAME}"
  log "WARN: could not read cluster_name from Terraform state; defaulting to '${CLUSTER_NAME}'"
fi

# ---------------------------------------------------------------------------
# Phase 1: cluster-side teardown — releases NLB + EBS PVCs that Terraform
#          doesn't track. Must happen BEFORE terraform destroy, otherwise
#          Terraform fails to delete subnets/VPC because the NLB ENIs are
#          still live.
# ---------------------------------------------------------------------------
echo "==> Phase 1: cluster-side teardown"

# Skip gracefully if kubectl context is not the target cluster
if kubectl config current-context 2>/dev/null | grep -q "${CLUSTER_NAME}"; then
  kubectl delete namespace skillai --wait --timeout=180s --ignore-not-found || true
  helm uninstall ingress-nginx -n ingress-nginx --wait --timeout=180s 2>/dev/null || true
  helm uninstall cert-manager -n cert-manager --wait --timeout=180s 2>/dev/null || true

  # Wait for NLB ENIs to drain (otherwise Terraform fails to delete subnets)
  echo "    waiting up to 90s for NLB ENIs to drain..."
  for _ in $(seq 1 18); do
    enis=$(aws ec2 describe-network-interfaces \
      --filters "Name=description,Values=*ELB*${CLUSTER_NAME}*" \
      --region "${REGION}" \
      --query 'length(NetworkInterfaces)' --output text 2>/dev/null || echo 0)
    [[ "${enis}" -eq 0 ]] && break
    sleep 5
  done
  log "cluster-side teardown complete."
else
  log "kubectl context does not match ${CLUSTER_NAME}; skipping cluster-side teardown"
fi

# ---------------------------------------------------------------------------
# Step 1 — Empty the ECR repository
# Terraform cannot delete an ECR repo with images in it.
# ---------------------------------------------------------------------------
if [[ ! -d "${TF_DIR}" ]]; then
  echo "[destroy] WARN: ${TF_DIR} not found — skipping ECR cleanup."
else
  cd "${TF_DIR}"
  ECR_URL="$(terraform output -raw ecr_repository_url 2>/dev/null || echo "")"
  if [[ -n "${ECR_URL}" ]]; then
    ECR_REPO="$(echo "${ECR_URL}" | cut -d'/' -f2-)"
    log "Deleting all images from ECR repo '${ECR_REPO}' ..."
    IMAGE_IDS="$(aws ecr list-images \
      --repository-name "${ECR_REPO}" \
      --region "${REGION}" \
      --query 'imageIds[*]' \
      --output json 2>/dev/null || echo '[]')"
    if [[ "${IMAGE_IDS}" != "[]" && -n "${IMAGE_IDS}" ]]; then
      aws ecr batch-delete-image \
        --repository-name "${ECR_REPO}" \
        --region "${REGION}" \
        --image-ids "${IMAGE_IDS}" \
        --output json > /dev/null
      log "ECR images deleted."
    else
      log "ECR repo is already empty."
    fi
  else
    log "WARN: Could not read ecr_repository_url from Terraform — ECR repo may not be empty."
    log "      Terraform destroy may fail with 'repository contains images'. If so,"
    log "      empty the ECR repo manually in the AWS console and re-run this script."
  fi
fi

# ---------------------------------------------------------------------------
# Step 2 — Write a temporary override file to remove lifecycle.prevent_destroy
#
# lifecycle.prevent_destroy cannot be controlled by a variable in HCL — the
# only way to override it is to replace the lifecycle block in a .tf.json
# override file.  This file is written here, used during destroy, then removed.
# It is listed in .gitignore and MUST NOT be committed.
# ---------------------------------------------------------------------------
cd "${TF_DIR}"
log "Writing temporary lifecycle override to disable prevent_destroy ..."
cat > "${OVERRIDE_FILE}" <<'JSON'
{
  "resource": {
    "aws_db_instance": {
      "main": {
        "lifecycle": {
          "prevent_destroy": false
        }
      }
    },
    "aws_efs_file_system": {
      "uploads": {
        "lifecycle": {
          "prevent_destroy": false
        }
      }
    }
  }
}
JSON

# ---------------------------------------------------------------------------
# Step 3 — Disable RDS deletion_protection and, if force mode, skip snapshot
# ---------------------------------------------------------------------------
if [[ "${FORCE_DESTROY}" == "1" ]]; then
  FORCE_VARS="-var force_destroy=true"
  log "Force mode: disabling deletion_protection and skipping final snapshot ..."
else
  FORCE_VARS="-var force_destroy=false"
  log "Disabling RDS deletion_protection (final snapshot will be taken on destroy) ..."
fi

# Targeted apply — only modifies the RDS instance attribute, does not touch
# other resources.  Runs non-interactively.
terraform apply \
  -target=aws_db_instance.main \
  ${FORCE_VARS} \
  -var "deletion_protection=false" \
  -auto-approve 2>/dev/null || {
    # Fallback: use AWS CLI to flip deletion protection directly if targeted
    # apply fails (e.g. state drift).
    log "WARN: targeted apply failed — attempting AWS CLI fallback to disable deletion_protection."
    RDS_ID="$(terraform output -raw rds_endpoint 2>/dev/null | cut -d'.' -f1 || echo '')"
    if [[ -n "${RDS_ID}" ]]; then
      aws rds modify-db-instance \
        --db-instance-identifier "${RDS_ID}" \
        --no-deletion-protection \
        --apply-immediately \
        --region "${REGION}" > /dev/null
      log "deletion_protection disabled via AWS CLI."
    else
      log "ERROR: Could not determine RDS identifier. Disable deletion_protection manually"
      log "       in the AWS console before re-running this script."
      rm -f "${OVERRIDE_FILE}"
      exit 1
    fi
  }

# ---------------------------------------------------------------------------
# Step 4 — Phase 2: terraform destroy
# ---------------------------------------------------------------------------
echo "==> Phase 2: terraform destroy"
log "Running terraform destroy ..."
terraform destroy ${FORCE_VARS} -auto-approve

# ---------------------------------------------------------------------------
# Step 5 — Clean up the override file
# ---------------------------------------------------------------------------
log "Removing temporary lifecycle override file ..."
rm -f "${OVERRIDE_FILE}"

# ---------------------------------------------------------------------------
# Post-destroy verification — list any orphaned resources that escaped
# Terraform and may still be accruing charges.
# ---------------------------------------------------------------------------
echo ""
echo "==> Post-destroy verification"
echo "    Checking for orphaned EBS volumes tagged to cluster '${CLUSTER_NAME}'..."
aws ec2 describe-volumes \
  --filters "Name=tag:kubernetes.io/cluster/${CLUSTER_NAME},Values=owned" \
  --query 'Volumes[*].[VolumeId,State]' \
  --output table \
  --region "${REGION}" 2>/dev/null || true

echo ""
echo "    Checking for orphaned network interfaces matching '${CLUSTER_NAME}'..."
aws ec2 describe-network-interfaces \
  --filters "Name=description,Values=*${CLUSTER_NAME}*" \
  --query 'NetworkInterfaces[*].[NetworkInterfaceId,Status]' \
  --output table \
  --region "${REGION}" 2>/dev/null || true

echo ""
log "If any resources are listed above, they are orphans — delete manually to stop billing."
echo ""
log "Destroy complete. All AWS resources have been deleted."
log "Billing for EKS, RDS, NLB, and NAT has stopped."
log ""
if [[ "${FORCE_DESTROY}" != "1" ]]; then
  log "REMINDER: The RDS final snapshot '${PROJECT_NAME}-db-final-<timestamp>' still"
  log "          exists in your AWS account and will incur minimal storage charges."
  log "          Delete it in the RDS console once you have confirmed data is no"
  log "          longer needed."
fi
log ""
log "NOTE: Your local .envrc and terraform state files still exist."
log "      Review and remove them manually if no longer needed."
