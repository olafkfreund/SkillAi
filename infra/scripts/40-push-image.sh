#!/usr/bin/env bash
# infra/scripts/40-push-image.sh
# Build a linux/arm64 Docker image (for t4g Graviton nodes) and push to ECR.
# Idempotent — re-running pushes a fresh build with the current git SHA.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TF_DIR="${REPO_ROOT}/infra/terraform"

# shellcheck source=/dev/null
eval "$(direnv export bash 2>/dev/null)" || source "${REPO_ROOT}/.envrc"

log() { echo "[push-image] $(date -u +%H:%M:%SZ) $*"; }

command -v aws    &>/dev/null || { echo "[push-image] ERROR: aws-cli not found."; exit 1; }
command -v docker &>/dev/null || { echo "[push-image] ERROR: docker not found."; exit 1; }

if [[ ! -d "${TF_DIR}" ]]; then
  echo "[push-image] ERROR: ${TF_DIR} not found. Run 10-terraform-apply.sh first."
  exit 1
fi

cd "${TF_DIR}"

# ---------------------------------------------------------------------------
# Read ECR URL from Terraform output
# ---------------------------------------------------------------------------
log "Reading Terraform outputs ..."
ECR_URL="$(terraform output -raw ecr_repository_url)"
if [[ -z "${ECR_URL}" ]]; then
  echo "[push-image] ERROR: ecr_repository_url output is empty."
  exit 1
fi

REGION="${AWS_REGION:-eu-west-2}"
ECR_REGISTRY="${ECR_URL%%/*}"
log "ECR registry: ${ECR_REGISTRY}"
log "ECR URL:      ${ECR_URL}"

# ---------------------------------------------------------------------------
# Docker login to ECR
# ---------------------------------------------------------------------------
log "Logging in to ECR ..."
aws ecr get-login-password --region "${REGION}" \
  | docker login --username AWS --password-stdin "${ECR_REGISTRY}"

# ---------------------------------------------------------------------------
# Determine image tag from git
# ---------------------------------------------------------------------------
cd "${REPO_ROOT}"
GIT_SHA="$(git rev-parse --short HEAD)"
TAG_SHA="${ECR_URL}:${GIT_SHA}"
TAG_LATEST="${ECR_URL}:latest"
log "Image tags: ${GIT_SHA} + latest"

# ---------------------------------------------------------------------------
# Ensure buildx builder with arm64 support exists
# ---------------------------------------------------------------------------
BUILDER_NAME="skillai-arm64-builder"
if ! docker buildx inspect "${BUILDER_NAME}" &>/dev/null; then
  log "Creating docker buildx builder '${BUILDER_NAME}' ..."
  docker buildx create --name "${BUILDER_NAME}" --driver docker-container --use
else
  log "Using existing buildx builder '${BUILDER_NAME}'"
  docker buildx use "${BUILDER_NAME}"
fi

# ---------------------------------------------------------------------------
# Build and push
# ---------------------------------------------------------------------------
log "Building linux/arm64 image (target=runner) ..."
log "This may take 5-10 minutes on first build."

docker buildx build \
  --platform linux/arm64 \
  --target runner \
  --tag "${TAG_SHA}" \
  --tag "${TAG_LATEST}" \
  --push \
  "${REPO_ROOT}"

# ---------------------------------------------------------------------------
# Verify image exists in ECR
# ---------------------------------------------------------------------------
log "Verifying image in ECR ..."
if aws ecr describe-images \
    --repository-name "$(echo "${ECR_URL}" | cut -d'/' -f2-)" \
    --region "${REGION}" \
    --image-ids imageTag="${GIT_SHA}" \
    --output json 2>/dev/null | grep -q '"imageTag"'; then
  log "Image ${GIT_SHA} confirmed in ECR."
else
  echo "[push-image] WARN: Could not confirm image tag in ECR via describe-images."
  echo "[push-image]       The push may still have succeeded — check the ECR console."
fi

echo ""
log "Image pushed: ${TAG_SHA}"
log "             ${TAG_LATEST}"
log "Current git SHA for use in deploy: ${GIT_SHA}"
