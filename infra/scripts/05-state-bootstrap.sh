#!/usr/bin/env bash
# infra/scripts/05-state-bootstrap.sh
#
# ONE-SHOT bootstrap for Terraform remote state.
# Run this ONCE before the first 10-terraform-apply.sh.
# Subsequent operators just run `terraform init` against the existing state.
#
# What it does:
#   1. Resolves the AWS account ID + region.
#   2. Creates (or verifies) an S3 bucket named:
#        <project>-terraform-state-<account-id>-<region>
#   3. Enables versioning on the bucket.
#   4. Enables SSE-KMS (using the account-default aws/s3 CMK) or falls back to SSE-S3.
#   5. Blocks all public access on the bucket.
#   6. Creates (or verifies) a DynamoDB lock table named:
#        <project>-terraform-lock
#      with a LockID (String) hash key and PAY_PER_REQUEST billing.
#   7. Writes infra/terraform/backend.tf with the resolved values.
#
# The script is idempotent — re-running it on an already-bootstrapped environment
# is safe (uses head-bucket / describe-table pre-checks and only applies changes
# when the resource or setting is missing).
#
# Usage:
#   infra/scripts/05-state-bootstrap.sh [project] [region]
#
#   Both arguments are optional.  Defaults come from variables.tf:
#     project = "skillai"
#     region  = "eu-west-2"
#   You can override them:
#     PROJECT=myproject REGION=us-east-1 infra/scripts/05-state-bootstrap.sh
#   Or positionally:
#     infra/scripts/05-state-bootstrap.sh myproject us-east-1

set -euo pipefail

# ---------------------------------------------------------------------------
# Resolve script paths
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TF_DIR="${REPO_ROOT}/infra/terraform"

# Source .envrc if present (works inside + outside direnv)
if [[ -f "${REPO_ROOT}/.envrc" ]]; then
  # shellcheck source=/dev/null
  eval "$(direnv export bash 2>/dev/null)" || source "${REPO_ROOT}/.envrc" 2>/dev/null || true
fi

log()  { echo "[state-bootstrap] $(date -u +%H:%M:%SZ) $*"; }
info() { echo "[state-bootstrap] INFO  $*"; }
ok()   { echo "[state-bootstrap] OK    $*"; }
warn() { echo "[state-bootstrap] WARN  $*"; }
err()  { echo "[state-bootstrap] ERROR $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Resolve project + region
# ---------------------------------------------------------------------------
PROJECT="${1:-${PROJECT:-skillai}}"
REGION="${2:-${REGION:-${AWS_REGION:-eu-west-2}}}"

# ---------------------------------------------------------------------------
# Sanity checks
# ---------------------------------------------------------------------------
command -v aws &>/dev/null   || err "'aws' CLI not found. Install it and re-run."
command -v python3 &>/dev/null || err "'python3' not found (used for JSON parsing)."

log "Checking AWS credentials ..."
IDENTITY=$(aws sts get-caller-identity --output json 2>/dev/null) \
  || err "'aws sts get-caller-identity' failed. Check AWS_PROFILE / credentials."

ACCOUNT_ID=$(echo "${IDENTITY}" | python3 -c 'import sys,json; print(json.load(sys.stdin)["Account"])')
log "  Account : ${ACCOUNT_ID}"
log "  Region  : ${REGION}"
log "  Project : ${PROJECT}"

# ---------------------------------------------------------------------------
# Derived names
# ---------------------------------------------------------------------------
BUCKET="${PROJECT}-terraform-state-${ACCOUNT_ID}-${REGION}"
LOCK_TABLE="${PROJECT}-terraform-lock"
STATE_KEY="${PROJECT}/eks/${REGION}/terraform.tfstate"
BACKEND_FILE="${TF_DIR}/backend.tf"

log "Resolved resource names:"
info "  S3 bucket    : ${BUCKET}"
info "  DynamoDB table: ${LOCK_TABLE}"
info "  State key    : ${STATE_KEY}"

echo ""

# ===========================================================================
# S3 BUCKET
# ===========================================================================

# ---------------------------------------------------------------------------
# 1. Create bucket (if it does not exist)
# ---------------------------------------------------------------------------
if aws s3api head-bucket --bucket "${BUCKET}" --region "${REGION}" 2>/dev/null; then
  ok "S3 bucket '${BUCKET}' already exists — skipping creation."
else
  log "Creating S3 bucket '${BUCKET}' in ${REGION} ..."

  if [[ "${REGION}" == "us-east-1" ]]; then
    # us-east-1 must NOT specify a LocationConstraint
    aws s3api create-bucket \
      --bucket "${BUCKET}" \
      --region "${REGION}" \
      --output text > /dev/null
  else
    aws s3api create-bucket \
      --bucket "${BUCKET}" \
      --region "${REGION}" \
      --create-bucket-configuration LocationConstraint="${REGION}" \
      --output text > /dev/null
  fi

  ok "Bucket created."
fi

# ---------------------------------------------------------------------------
# 2. Enable versioning
# ---------------------------------------------------------------------------
VERSIONING=$(aws s3api get-bucket-versioning \
  --bucket "${BUCKET}" \
  --region "${REGION}" \
  --output json 2>/dev/null || echo '{}')
VERSIONING_STATUS=$(echo "${VERSIONING}" | python3 -c \
  'import sys,json; d=json.load(sys.stdin); print(d.get("Status",""))' 2>/dev/null || echo "")

if [[ "${VERSIONING_STATUS}" == "Enabled" ]]; then
  ok "Versioning already enabled."
else
  log "Enabling versioning on bucket '${BUCKET}' ..."
  aws s3api put-bucket-versioning \
    --bucket "${BUCKET}" \
    --region "${REGION}" \
    --versioning-configuration Status=Enabled
  ok "Versioning enabled."
fi

# ---------------------------------------------------------------------------
# 3. Enable server-side encryption (KMS preferred, SSE-S3 fallback)
# ---------------------------------------------------------------------------

# Check if a customer-managed KMS key alias "alias/terraform-state" exists.
# If it does, use it.  Otherwise use the account-default aws/s3 key (still
# AWS-managed KMS, not SSE-S3) which is always available.
KMS_KEY_ID=""
if aws kms describe-key --key-id "alias/terraform-state" \
   --region "${REGION}" --output json &>/dev/null; then
  KMS_KEY_ID=$(aws kms describe-key --key-id "alias/terraform-state" \
    --region "${REGION}" --output json \
    | python3 -c 'import sys,json; print(json.load(sys.stdin)["KeyMetadata"]["Arn"])')
  log "Customer-managed KMS key found: ${KMS_KEY_ID}"
fi

# Check current encryption config
CURRENT_ENC=$(aws s3api get-bucket-encryption \
  --bucket "${BUCKET}" \
  --region "${REGION}" \
  --output json 2>/dev/null || echo '{}')
ENC_ALGO=$(echo "${CURRENT_ENC}" | python3 -c \
  'import sys,json
d=json.load(sys.stdin)
rules=d.get("ServerSideEncryptionConfiguration",{}).get("Rules",[])
if rules:
  sse=rules[0].get("ApplyServerSideEncryptionByDefault",{})
  print(sse.get("SSEAlgorithm",""))
else:
  print("")
' 2>/dev/null || echo "")

if [[ -n "${ENC_ALGO}" ]]; then
  ok "Encryption already configured (${ENC_ALGO}) — skipping."
else
  if [[ -n "${KMS_KEY_ID}" ]]; then
    log "Enabling SSE-KMS encryption (CMK: ${KMS_KEY_ID}) ..."
    aws s3api put-bucket-encryption \
      --bucket "${BUCKET}" \
      --region "${REGION}" \
      --server-side-encryption-configuration '{
        "Rules": [{
          "ApplyServerSideEncryptionByDefault": {
            "SSEAlgorithm": "aws:kms",
            "KMSMasterKeyID": "'"${KMS_KEY_ID}"'"
          },
          "BucketKeyEnabled": true
        }]
      }'
    ok "SSE-KMS enabled."
  else
    log "Enabling SSE with aws/s3 managed key (SSE-KMS with aws/s3 alias) ..."
    aws s3api put-bucket-encryption \
      --bucket "${BUCKET}" \
      --region "${REGION}" \
      --server-side-encryption-configuration '{
        "Rules": [{
          "ApplyServerSideEncryptionByDefault": {
            "SSEAlgorithm": "aws:kms"
          },
          "BucketKeyEnabled": true
        }]
      }'
    ok "SSE-KMS (aws/s3 default key) enabled."
  fi
fi

# ---------------------------------------------------------------------------
# 4. Block all public access
# ---------------------------------------------------------------------------
PUBLIC_ACCESS=$(aws s3api get-public-access-block \
  --bucket "${BUCKET}" \
  --region "${REGION}" \
  --output json 2>/dev/null || echo '{}')
BLOCK_ALL=$(echo "${PUBLIC_ACCESS}" | python3 -c \
  'import sys,json
d=json.load(sys.stdin).get("PublicAccessBlockConfiguration",{})
all_blocked=(
  d.get("BlockPublicAcls",False) and
  d.get("IgnorePublicAcls",False) and
  d.get("BlockPublicPolicy",False) and
  d.get("RestrictPublicBuckets",False)
)
print("true" if all_blocked else "false")
' 2>/dev/null || echo "false")

if [[ "${BLOCK_ALL}" == "true" ]]; then
  ok "Public access already fully blocked."
else
  log "Blocking all public access on bucket '${BUCKET}' ..."
  aws s3api put-public-access-block \
    --bucket "${BUCKET}" \
    --region "${REGION}" \
    --public-access-block-configuration \
      "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
  ok "Public access blocked."
fi

echo ""

# ===========================================================================
# DYNAMODB LOCK TABLE
# ===========================================================================

if aws dynamodb describe-table \
     --table-name "${LOCK_TABLE}" \
     --region "${REGION}" \
     --output json &>/dev/null; then
  ok "DynamoDB table '${LOCK_TABLE}' already exists — skipping creation."
else
  log "Creating DynamoDB table '${LOCK_TABLE}' ..."
  aws dynamodb create-table \
    --table-name "${LOCK_TABLE}" \
    --region "${REGION}" \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --output text > /dev/null

  log "Waiting for table to become ACTIVE ..."
  aws dynamodb wait table-exists \
    --table-name "${LOCK_TABLE}" \
    --region "${REGION}"

  ok "DynamoDB table created and active."
fi

echo ""

# ===========================================================================
# WRITE backend.tf
# ===========================================================================

log "Writing ${BACKEND_FILE} ..."

cat > "${BACKEND_FILE}" <<HCL
# infra/terraform/backend.tf
#
# Generated by infra/scripts/05-state-bootstrap.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ).
# DO NOT edit by hand — re-run 05-state-bootstrap.sh to regenerate.
#
# To migrate an existing local state to this backend, run:
#   cd infra/terraform
#   terraform init -migrate-state
# Terraform will prompt to copy the local state file to S3.
# After migration, delete local terraform.tfstate and terraform.tfstate.backup.

terraform {
  backend "s3" {
    bucket         = "${BUCKET}"
    key            = "${STATE_KEY}"
    region         = "${REGION}"
    encrypt        = true
    dynamodb_table = "${LOCK_TABLE}"
  }
}
HCL

ok "backend.tf written."

echo ""
echo "========================================================================="
echo " State bootstrap COMPLETE"
echo "========================================================================="
echo ""
echo "  S3 bucket     : ${BUCKET}"
echo "  State key     : ${STATE_KEY}"
echo "  DynamoDB table: ${LOCK_TABLE}"
echo "  Region        : ${REGION}"
echo "  backend.tf    : ${BACKEND_FILE}"
echo ""
echo " Next steps:"
echo ""
echo "  First-time operator (no prior local state):"
echo "    cd infra/terraform && terraform init"
echo "    infra/scripts/10-terraform-apply.sh"
echo ""
echo "  Migrating from local state:"
echo "    cd infra/terraform && terraform init -migrate-state"
echo "    # Terraform will prompt: copy local state to S3? → yes"
echo "    rm -f infra/terraform/terraform.tfstate infra/terraform/terraform.tfstate.backup"
echo ""
echo "  Subsequent team members:"
echo "    cd infra/terraform && terraform init"
echo "    # Terraform fetches state from S3 automatically."
echo ""
echo "  backend.tf is committed to the repo; bucket/table names are not secrets."
echo "========================================================================="
