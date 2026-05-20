#!/usr/bin/env bash
# infra/scripts/50-render-secret.sh
# Render infra/k8s/base/secret.yaml from secret.template.yaml + .envrc vars.
#
# IMPORTANT:
#   - The rendered secret.yaml is gitignored — never commit it.
#   - The ENCRYPTION_KEY in .envrc MUST match the value in local .env.local;
#     this script asserts that and refuses to proceed if they differ.
#   - Re-run this whenever you update NEXTAUTH_URL or any secret in .envrc.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TF_DIR="${REPO_ROOT}/infra/terraform"
K8S_BASE="${REPO_ROOT}/infra/k8s/base"
TEMPLATE="${K8S_BASE}/secret.template.yaml"
OUTPUT="${K8S_BASE}/secret.yaml"
ENV_LOCAL="${REPO_ROOT}/.env.local"

# shellcheck source=/dev/null
eval "$(direnv export bash 2>/dev/null)" || source "${REPO_ROOT}/.envrc"

log() { echo "[render-secret] $(date -u +%H:%M:%SZ) $*"; }

# ---------------------------------------------------------------------------
# Required vars
# ---------------------------------------------------------------------------
REQUIRED=(
  ENCRYPTION_KEY
  AUTH_SECRET
  NEXTAUTH_URL
  APP_URL
  NEXT_PUBLIC_APP_URL
  ANTHROPIC_API_KEY
)
for v in "${REQUIRED[@]}"; do
  if [[ -z "${!v:-}" ]]; then
    echo "[render-secret] ERROR: ${v} is unset in .envrc."
    exit 1
  fi
done

# ---------------------------------------------------------------------------
# CRITICAL: Assert ENCRYPTION_KEY matches .env.local (if it exists)
# Rotating this key strands every tenant's encrypted API keys in the DB.
# ---------------------------------------------------------------------------
if [[ -f "${ENV_LOCAL}" ]]; then
  LOCAL_KEY="$(grep -E '^ENCRYPTION_KEY=' "${ENV_LOCAL}" | head -n1 | cut -d'=' -f2- | tr -d '"' | tr -d "'")"
  if [[ -n "${LOCAL_KEY}" && "${LOCAL_KEY}" != "${ENCRYPTION_KEY}" ]]; then
    echo "[render-secret] FATAL: ENCRYPTION_KEY in .envrc does NOT match the value in .env.local."
    echo "[render-secret]"
    echo "[render-secret]   The tenant_settings table stores API keys encrypted with this key."
    echo "[render-secret]   If you deploy a different key, ALL stored API keys become unreadable."
    echo "[render-secret]"
    echo "[render-secret]   Fix: copy ENCRYPTION_KEY verbatim from .env.local into .envrc,"
    echo "[render-secret]        then re-run this script."
    exit 1
  fi
  log "ENCRYPTION_KEY verified — matches .env.local."
else
  log "WARN: .env.local not found at ${ENV_LOCAL} — skipping key consistency check."
  log "      Make sure ENCRYPTION_KEY in .envrc is the SAME value used in the running portal."
fi

# ---------------------------------------------------------------------------
# Read RDS connection details from Terraform outputs
# ---------------------------------------------------------------------------
if [[ -d "${TF_DIR}" ]]; then
  log "Reading RDS details from Terraform outputs ..."
  cd "${TF_DIR}"
  RDS_ENDPOINT="$(terraform output -raw rds_endpoint 2>/dev/null || echo "")"
  RDS_PORT="$(terraform output -raw rds_port 2>/dev/null || echo "5432")"
  RDS_DATABASE="$(terraform output -raw rds_database 2>/dev/null || echo "skillai")"
  RDS_USERNAME="$(terraform output -raw rds_username 2>/dev/null || echo "")"
  RDS_PASSWORD="$(terraform output -raw rds_password 2>/dev/null || echo "")"
  cd "${REPO_ROOT}"
else
  log "WARN: Terraform dir not found — DATABASE_URL will be empty."
  log "      Run 10-terraform-apply.sh first, or manually set RDS vars."
  RDS_ENDPOINT="" RDS_PORT="5432" RDS_DATABASE="skillai" RDS_USERNAME="" RDS_PASSWORD=""
fi

if [[ -z "${RDS_ENDPOINT}" || -z "${RDS_USERNAME}" || -z "${RDS_PASSWORD}" ]]; then
  echo "[render-secret] ERROR: Could not read RDS connection details from Terraform outputs."
  echo "[render-secret]        RDS_ENDPOINT='${RDS_ENDPOINT}' RDS_USERNAME='${RDS_USERNAME}'"
  echo "[render-secret]        Run 10-terraform-apply.sh first."
  exit 1
fi

DATABASE_URL="postgresql://${RDS_USERNAME}:${RDS_PASSWORD}@${RDS_ENDPOINT}:${RDS_PORT}/${RDS_DATABASE}?sslmode=require"

# ---------------------------------------------------------------------------
# Check template exists
# ---------------------------------------------------------------------------
if [[ ! -f "${TEMPLATE}" ]]; then
  echo "[render-secret] ERROR: Template not found at ${TEMPLATE}."
  echo "[render-secret]        The k8s-manifests agent should have created this file."
  exit 1
fi

# ---------------------------------------------------------------------------
# Base64-encode values (k8s Secrets use base64)
# ---------------------------------------------------------------------------
b64() { printf '%s' "$1" | base64 | tr -d '\n'; }

log "Rendering ${OUTPUT} ..."

sed \
  -e "s|__DATABASE_URL__|$(b64 "${DATABASE_URL}")|g" \
  -e "s|__ENCRYPTION_KEY__|$(b64 "${ENCRYPTION_KEY}")|g" \
  -e "s|__AUTH_SECRET__|$(b64 "${AUTH_SECRET}")|g" \
  -e "s|__NEXTAUTH_URL__|$(b64 "${NEXTAUTH_URL}")|g" \
  -e "s|__APP_URL__|$(b64 "${APP_URL}")|g" \
  -e "s|__NEXT_PUBLIC_APP_URL__|$(b64 "${NEXT_PUBLIC_APP_URL}")|g" \
  -e "s|__ANTHROPIC_API_KEY__|$(b64 "${ANTHROPIC_API_KEY}")|g" \
  -e "s|__GEMINI_API_KEY__|$(b64 "${GEMINI_API_KEY:-}")|g" \
  -e "s|__OPENAI_API_KEY__|$(b64 "${OPENAI_API_KEY:-}")|g" \
  -e "s|__BRAVE_SEARCH_API_KEY__|$(b64 "${BRAVE_SEARCH_API_KEY:-}")|g" \
  -e "s|__CRON_SECRET__|$(b64 "${CRON_SECRET:-}")|g" \
  "${TEMPLATE}" > "${OUTPUT}"

# Prepend the auto-generated warning
TMP="$(mktemp)"
{
  echo "# AUTO-GENERATED — DO NOT COMMIT."
  echo "# Regenerate via infra/scripts/50-render-secret.sh"
  echo "# Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  cat "${OUTPUT}"
} > "${TMP}"
mv "${TMP}" "${OUTPUT}"

log "Secret rendered to ${OUTPUT}"
log "This file is gitignored — do not commit it."
echo ""
log "Next step: run infra/scripts/80-deploy.sh (or kubectl apply -k infra/k8s/overlays/prod)"
