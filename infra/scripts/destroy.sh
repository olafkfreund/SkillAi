#!/usr/bin/env bash
# infra/scripts/destroy.sh
# Tear down ALL AWS resources created by this project.
#
# WARNING: This is irreversible. It will delete:
#   - EKS cluster (all workloads, PVCs, etc.)
#   - RDS instance (ALL candidate data — take a pg_dump first!)
#   - EFS filesystem (ALL uploaded CVs)
#   - ECR repository (ALL images)
#   - VPC, subnets, NAT, NLB
#
# The script:
#   1. Prompts for the project name to confirm intent (twice).
#   2. Empties the ECR repository (Terraform cannot delete a non-empty ECR).
#   3. Runs terraform destroy.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TF_DIR="${REPO_ROOT}/infra/terraform"

# shellcheck source=/dev/null
eval "$(direnv export bash 2>/dev/null)" || source "${REPO_ROOT}/.envrc"

log() { echo "[destroy] $(date -u +%H:%M:%SZ) $*"; }

PROJECT_NAME="skillai"
REGION="${AWS_REGION:-eu-west-2}"

command -v terraform &>/dev/null || { echo "[destroy] ERROR: terraform not found."; exit 1; }
command -v aws       &>/dev/null || { echo "[destroy] ERROR: aws-cli not found."; exit 1; }

# ---------------------------------------------------------------------------
# Cost warning
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
echo "[destroy]  TAKE A BACKUP FIRST if you want to preserve data:"
echo "[destroy]    pg_dump -U skillai -h <rds-endpoint> skillai > backup.dump"
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
# Step 2 — terraform destroy
# ---------------------------------------------------------------------------
log "Running terraform destroy ..."
cd "${TF_DIR}"
terraform destroy -auto-approve

echo ""
log "Destroy complete. All AWS resources have been deleted."
log "Billing for EKS, RDS, NLB, and NAT has stopped."
log ""
log "NOTE: Your local .envrc and terraform state files still exist."
log "      Review and remove them manually if no longer needed."
