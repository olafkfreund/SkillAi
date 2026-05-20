#!/usr/bin/env bash
# infra/scripts/10-terraform-apply.sh
# Initialise Terraform and apply the infra plan with an interactive prompt.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TF_DIR="${REPO_ROOT}/infra/terraform"

# shellcheck source=/dev/null
eval "$(direnv export bash 2>/dev/null)" || source "${REPO_ROOT}/.envrc"

log() { echo "[tf-apply] $(date -u +%H:%M:%SZ) $*"; }

# ---------------------------------------------------------------------------
# Sanity checks
# ---------------------------------------------------------------------------
if [[ ! -d "${TF_DIR}" ]]; then
  echo "[tf-apply] ERROR: ${TF_DIR} does not exist."
  echo "[tf-apply]        Make sure the Terraform files from the other agent have been committed."
  exit 1
fi

command -v terraform &>/dev/null || { echo "[tf-apply] ERROR: terraform not found. Run 00-preflight.sh first."; exit 1; }

log "Working directory: ${TF_DIR}"
cd "${TF_DIR}"

# ---------------------------------------------------------------------------
# terraform init
# ---------------------------------------------------------------------------
log "Running terraform init -upgrade ..."
terraform init -upgrade

# ---------------------------------------------------------------------------
# terraform plan → saved plan file
# ---------------------------------------------------------------------------
log "Running terraform plan (output saved to tfplan) ..."
terraform plan -out=tfplan

echo ""
echo "[tf-apply] -------------------------------------------------------"
echo "[tf-apply]  Review the plan above."
echo "[tf-apply]  This will create/modify real AWS resources (~\$150/mo)."
echo "[tf-apply] -------------------------------------------------------"
echo ""
read -r -p "[tf-apply] Apply? (y/N) " REPLY
echo ""

case "${REPLY}" in
  y|Y|yes|YES)
    log "Applying plan ..."
    terraform apply tfplan
    log "Apply complete."
    ;;
  *)
    log "Aborted. Plan file kept at ${TF_DIR}/tfplan for review."
    exit 0
    ;;
esac

# ---------------------------------------------------------------------------
# Print outputs for the operator
# ---------------------------------------------------------------------------
echo ""
log "Terraform outputs:"
terraform output
