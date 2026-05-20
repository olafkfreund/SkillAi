#!/usr/bin/env bash
# infra/scripts/00-preflight.sh
# Verify that all required tools are installed and the AWS session is active.
# Run this before any other infra script.
set -euo pipefail

# ---------------------------------------------------------------------------
# Source .envrc (works both inside and outside direnv)
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

if [[ ! -f "${REPO_ROOT}/.envrc" ]]; then
  echo "[preflight] ERROR: .envrc not found at ${REPO_ROOT}/.envrc"
  echo "[preflight]        Copy .envrc.example to .envrc, fill in your values, and re-run."
  exit 1
fi

# shellcheck source=/dev/null
eval "$(direnv export bash 2>/dev/null)" || source "${REPO_ROOT}/.envrc"

log() { echo "[preflight] $(date -u +%H:%M:%SZ) $*"; }

# ---------------------------------------------------------------------------
# Helper: compare semver strings  (returns 0 if $1 >= $2)
# ---------------------------------------------------------------------------
version_gte() {
  local have="$1" need="$2"
  # Strip any non-numeric prefix (v1.30 -> 1.30)
  have="${have#v}"; need="${need#v}"
  printf '%s\n%s\n' "${need}" "${have}" | sort -V | head -n1 | grep -qF "${need}"
}

FAIL=0

check_tool() {
  local name="$1" min_ver="$2" raw_ver_cmd="$3"
  log "Checking ${name} >= ${min_ver} ..."
  if ! command -v "${name}" &>/dev/null; then
    echo "[preflight] ERROR: '${name}' not found in PATH."
    echo "[preflight]        Install it: ${4:-see project README}"
    FAIL=1
    return
  fi
  local raw_ver
  raw_ver=$(eval "${raw_ver_cmd}" 2>&1 | grep -Eo '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -n1 || true)
  if [[ -z "${raw_ver}" ]]; then
    echo "[preflight] WARN: Could not parse ${name} version — proceeding anyway."
    return
  fi
  if version_gte "${raw_ver}" "${min_ver}"; then
    log "  ${name} ${raw_ver} — OK"
  else
    echo "[preflight] ERROR: ${name} ${raw_ver} is below required minimum ${min_ver}."
    echo "[preflight]        Please upgrade ${name}."
    FAIL=1
  fi
}

# ---------------------------------------------------------------------------
# Tool checks
# ---------------------------------------------------------------------------
check_tool "aws"      "2.15"  "aws --version"                  "https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html"
check_tool "kubectl"  "1.30"  "kubectl version --client -o json | python3 -c \"import sys,json; d=json.load(sys.stdin); print(d['clientVersion']['gitVersion'])\" 2>/dev/null || kubectl version --client 2>&1" \
                               "https://kubernetes.io/docs/tasks/tools/"
check_tool "terraform" "1.7"  "terraform -version"             "https://developer.hashicorp.com/terraform/install"
check_tool "helm"     "3.14"  "helm version --short"           "https://helm.sh/docs/intro/install/"
check_tool "direnv"   "2.0"   "direnv --version"               "https://direnv.net/#basic-installation"
check_tool "docker"   "24.0"  "docker --version"               "https://docs.docker.com/get-docker/"
check_tool "psql"     "15.0"  "psql --version"                 "https://www.postgresql.org/download/ (or: apt install postgresql-client)"

# ---------------------------------------------------------------------------
# Check critical env vars are set
# ---------------------------------------------------------------------------
log "Checking required environment variables ..."
REQUIRED_VARS=(
  AWS_REGION
  ENCRYPTION_KEY
  AUTH_SECRET
  NEXTAUTH_URL
  APP_URL
  NEXT_PUBLIC_APP_URL
  ANTHROPIC_API_KEY
)
MISSING_VARS=()
for v in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!v:-}" ]]; then
    MISSING_VARS+=("${v}")
  fi
done

if [[ ${#MISSING_VARS[@]} -gt 0 ]]; then
  echo "[preflight] ERROR: The following required variables are unset in .envrc:"
  for v in "${MISSING_VARS[@]}"; do
    echo "[preflight]   - ${v}"
  done
  FAIL=1
fi

# ---------------------------------------------------------------------------
# AWS caller identity check
# ---------------------------------------------------------------------------
log "Checking AWS credentials (aws sts get-caller-identity) ..."
if ! aws sts get-caller-identity --output json 2>/dev/null | grep -q '"Account"'; then
  echo "[preflight] ERROR: 'aws sts get-caller-identity' failed."
  echo "[preflight]        Check AWS_PROFILE / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY"
  echo "[preflight]        and ensure the credentials have EKS+RDS+ECR+EFS+IAM permissions."
  FAIL=1
else
  IDENTITY=$(aws sts get-caller-identity --output json 2>/dev/null)
  log "  AWS Account: $(echo "${IDENTITY}" | python3 -c 'import sys,json; print(json.load(sys.stdin)["Account"])')"
  log "  ARN:         $(echo "${IDENTITY}" | python3 -c 'import sys,json; print(json.load(sys.stdin)["Arn"])')"
  log "  Region:      ${AWS_REGION}"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
if [[ "${FAIL}" -ne 0 ]]; then
  echo ""
  echo "[preflight] FAILED — fix the errors above, then re-run this script."
  exit 1
fi

log "All preflight checks PASSED. You're ready to run the infra scripts."
