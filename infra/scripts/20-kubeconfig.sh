#!/usr/bin/env bash
# infra/scripts/20-kubeconfig.sh
# Update local kubeconfig from Terraform outputs and verify node connectivity.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TF_DIR="${REPO_ROOT}/infra/terraform"

# shellcheck source=/dev/null
eval "$(direnv export bash 2>/dev/null)" || source "${REPO_ROOT}/.envrc"

log() { echo "[kubeconfig] $(date -u +%H:%M:%SZ) $*"; }

command -v aws     &>/dev/null || { echo "[kubeconfig] ERROR: aws-cli not found."; exit 1; }
command -v kubectl &>/dev/null || { echo "[kubeconfig] ERROR: kubectl not found."; exit 1; }

if [[ ! -d "${TF_DIR}" ]]; then
  echo "[kubeconfig] ERROR: ${TF_DIR} not found. Run 10-terraform-apply.sh first."
  exit 1
fi

cd "${TF_DIR}"

# ---------------------------------------------------------------------------
# Read outputs from Terraform
# ---------------------------------------------------------------------------
log "Reading Terraform outputs ..."
CLUSTER_NAME="$(terraform output -raw cluster_name)"
REGION="${AWS_REGION:-eu-west-2}"

if [[ -z "${CLUSTER_NAME}" ]]; then
  echo "[kubeconfig] ERROR: cluster_name output is empty. Did terraform apply succeed?"
  exit 1
fi

log "Cluster: ${CLUSTER_NAME}  Region: ${REGION}"

# ---------------------------------------------------------------------------
# Update kubeconfig
# ---------------------------------------------------------------------------
log "Updating kubeconfig ..."
aws eks update-kubeconfig --region "${REGION}" --name "${CLUSTER_NAME}"

# ---------------------------------------------------------------------------
# Verify connectivity
# ---------------------------------------------------------------------------
log "Verifying node connectivity ..."
RETRIES=10
for i in $(seq 1 "${RETRIES}"); do
  if kubectl get nodes 2>/dev/null | grep -q "Ready"; then
    log "Nodes are Ready:"
    kubectl get nodes
    break
  fi
  if [[ "${i}" -eq "${RETRIES}" ]]; then
    echo "[kubeconfig] ERROR: No nodes reached Ready state after ${RETRIES} attempts."
    echo "[kubeconfig]        Check: aws eks describe-nodegroup --cluster-name ${CLUSTER_NAME} --nodegroup-name skillai"
    exit 1
  fi
  log "  Waiting for nodes (attempt ${i}/${RETRIES}) ..."
  sleep 10
done

log "kubeconfig updated successfully."
