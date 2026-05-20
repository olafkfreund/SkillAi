#!/usr/bin/env bash
# infra/scripts/60-db-migrate.sh
# Two-phase database migration for the initial EKS deploy:
#
#   Phase A — Schema: run Drizzle migrations against RDS via a kubectl one-shot pod.
#   Phase B — Data:   pg_dump local DB → restore to RDS via a psql client pod.
#
# Prerequisites:
#   - kubectl context already points at the EKS cluster (run 20-kubeconfig.sh)
#   - Container image already pushed to ECR (run 40-push-image.sh)
#   - RDS reachable from within the cluster (private subnet security groups allow it)
#   - psql installed locally (for the initial dump)
#
# This script is intended to be run ONCE on first deploy.
# For subsequent deploys, the migrate Job in 80-deploy.sh handles schema-only migration.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TF_DIR="${REPO_ROOT}/infra/terraform"
DUMP_FILE="/tmp/skillai-$(date +%Y%m%d-%H%M%S).dump"
NAMESPACE="skillai"

# shellcheck source=/dev/null
eval "$(direnv export bash 2>/dev/null)" || source "${REPO_ROOT}/.envrc"

log() { echo "[db-migrate] $(date -u +%H:%M:%SZ) $*"; }

command -v kubectl &>/dev/null || { echo "[db-migrate] ERROR: kubectl not found."; exit 1; }
command -v psql    &>/dev/null || { echo "[db-migrate] ERROR: psql not found. Install postgresql-client."; exit 1; }
command -v pg_dump &>/dev/null || { echo "[db-migrate] ERROR: pg_dump not found. Install postgresql-client."; exit 1; }

if [[ ! -d "${TF_DIR}" ]]; then
  echo "[db-migrate] ERROR: ${TF_DIR} not found. Run 10-terraform-apply.sh first."
  exit 1
fi

cd "${TF_DIR}"

# ---------------------------------------------------------------------------
# Read Terraform outputs
# ---------------------------------------------------------------------------
log "Reading Terraform outputs ..."
ECR_URL="$(terraform output -raw ecr_repository_url)"
RDS_ENDPOINT="$(terraform output -raw rds_endpoint)"
RDS_PORT="$(terraform output -raw rds_port)"
RDS_DATABASE="$(terraform output -raw rds_database)"
RDS_USERNAME="$(terraform output -raw rds_username)"
RDS_PASSWORD="$(terraform output -raw rds_password)"

cd "${REPO_ROOT}"

GIT_SHA="$(git rev-parse --short HEAD)"
IMAGE_TAG="${ECR_URL}:${GIT_SHA}"
RDS_URL="postgresql://${RDS_USERNAME}:${RDS_PASSWORD}@${RDS_ENDPOINT}:${RDS_PORT}/${RDS_DATABASE}?sslmode=require"

log "RDS endpoint : ${RDS_ENDPOINT}:${RDS_PORT}/${RDS_DATABASE}"
log "Image tag    : ${IMAGE_TAG}"

# ---------------------------------------------------------------------------
# Ensure namespace exists (idempotent) before creating the Secret or trap.
# NOTE: a separate ordering bug exists where the namespace may not yet exist
# at this point in first-ever deploys — fixing that is out of scope here.
# ---------------------------------------------------------------------------
kubectl create namespace "${NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -

# ---------------------------------------------------------------------------
# Store DB credentials in a transient k8s Secret.
# The EXIT trap below guarantees cleanup even on failure.
# ---------------------------------------------------------------------------
kubectl create secret generic skillai-migrate-creds \
  --namespace="${NAMESPACE}" \
  --from-literal=PGPASSWORD="${RDS_PASSWORD}" \
  --from-literal=DATABASE_URL="${RDS_URL}" \
  --dry-run=client -o yaml | kubectl apply -f -

# Cleanup trap — runs on EXIT regardless of success or failure.
# shellcheck disable=SC2064
trap "kubectl delete secret skillai-migrate-creds -n ${NAMESPACE} --ignore-not-found" EXIT

# ---------------------------------------------------------------------------
# Phase A — Schema migrations via pod manifests (one-shot pods)
# ---------------------------------------------------------------------------
log "-------------------------------------------------------"
log " Phase A: Running Drizzle schema migrations against RDS"
log "-------------------------------------------------------"

# Ensure pgvector extension exists before Drizzle touches the schema.
# Credentials are injected via envFrom referencing the Secret — no plaintext
# values in the manifest or in kubectl flags.
log "Ensuring pgvector extension on RDS ..."
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: skillai-pgvector-init
  namespace: ${NAMESPACE}
spec:
  restartPolicy: Never
  containers:
  - name: skillai-pgvector-init
    image: postgres:17-alpine
    command:
    - psql
    - --host=${RDS_ENDPOINT}
    - --port=${RDS_PORT}
    - --username=${RDS_USERNAME}
    - --dbname=${RDS_DATABASE}
    - --command=CREATE EXTENSION IF NOT EXISTS vector;
    envFrom:
    - secretRef:
        name: skillai-migrate-creds
EOF

kubectl wait pod/skillai-pgvector-init \
  --namespace="${NAMESPACE}" \
  --for=condition=Ready \
  --timeout=120s \
  || true   # pod may complete before Ready fires; check logs below

# Stream logs then delete (idempotent — extension may already exist)
kubectl logs -n "${NAMESPACE}" skillai-pgvector-init --follow || true
kubectl delete pod/skillai-pgvector-init --namespace="${NAMESPACE}" --ignore-not-found

log "Running Drizzle migrations ..."
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: skillai-migrate
  namespace: ${NAMESPACE}
spec:
  restartPolicy: Never
  containers:
  - name: skillai-migrate
    image: ${IMAGE_TAG}
    command: ["node", "/app/scripts/migrate.mjs"]
    envFrom:
    - secretRef:
        name: skillai-migrate-creds
EOF

kubectl wait pod/skillai-migrate \
  --namespace="${NAMESPACE}" \
  --for=condition=Ready \
  --timeout=120s

kubectl logs -n "${NAMESPACE}" skillai-migrate --follow
kubectl delete pod/skillai-migrate --namespace="${NAMESPACE}" --ignore-not-found

log "Phase A complete — schema migrations applied."

# ---------------------------------------------------------------------------
# Phase B — Data restore
# ---------------------------------------------------------------------------
echo ""
echo "[db-migrate] -------------------------------------------------------"
echo "[db-migrate]  Phase B: Dump local DB and restore to RDS"
echo "[db-migrate]"
echo "[db-migrate]  This step copies your LOCAL database to RDS."
echo "[db-migrate]  Only run this on first deploy — it will overwrite RDS data."
echo "[db-migrate] -------------------------------------------------------"
read -r -p "[db-migrate] Run Phase B (data restore)? (y/N) " REPLY
echo ""

if [[ ! "${REPLY}" =~ ^[Yy]$ ]]; then
  log "Skipping Phase B. Run 80-deploy.sh to deploy the app."
  exit 0
fi

# ---------------------------------------------------------------------------
# Dump local DB
# ---------------------------------------------------------------------------
LOCAL_DB_NAME="${LOCAL_DB_NAME:-skillai}"
LOCAL_DB_USER="${LOCAL_DB_USER:-skillai}"
LOCAL_DB_HOST="${LOCAL_DB_HOST:-localhost}"
LOCAL_DB_PORT="${LOCAL_DB_PORT:-5433}"

log "Dumping local database '${LOCAL_DB_NAME}' to ${DUMP_FILE} ..."
log "(If prompted for a password, enter the local DB password)"
PGPASSWORD="${LOCAL_DB_PASSWORD:-}" pg_dump \
  --host="${LOCAL_DB_HOST}" \
  --port="${LOCAL_DB_PORT}" \
  --username="${LOCAL_DB_USER}" \
  --format=custom \
  --compress=9 \
  --no-privileges \
  --no-owner \
  "${LOCAL_DB_NAME}" > "${DUMP_FILE}"

DUMP_SIZE="$(du -sh "${DUMP_FILE}" | cut -f1)"
log "Dump complete: ${DUMP_FILE} (${DUMP_SIZE})"

# ---------------------------------------------------------------------------
# Copy dump into a bastion pod and restore to RDS
# ---------------------------------------------------------------------------
log "Spinning up psql client pod in namespace=${NAMESPACE} ..."

# Credentials come from the skillai-migrate-creds Secret via envFrom — no
# plaintext values in the manifest.
BASTION_POD="skillai-db-restore"
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: ${BASTION_POD}
  namespace: ${NAMESPACE}
spec:
  restartPolicy: Never
  containers:
  - name: psql
    image: postgres:17-alpine
    command: ["sh", "-c", "while true; do sleep 3600; done"]
    envFrom:
    - secretRef:
        name: skillai-migrate-creds
EOF

log "Waiting for bastion pod to be running ..."
kubectl wait pod/"${BASTION_POD}" \
  --namespace="${NAMESPACE}" \
  --for=condition=Ready \
  --timeout=120s

log "Copying dump file into bastion pod ..."
kubectl cp "${DUMP_FILE}" "${NAMESPACE}/${BASTION_POD}:/tmp/skillai.dump"

log "Running pg_restore on RDS (data-only, no-owner, disable-triggers) ..."
kubectl exec -n "${NAMESPACE}" "${BASTION_POD}" -- \
  pg_restore \
    --host="${RDS_ENDPOINT}" \
    --port="${RDS_PORT}" \
    --username="${RDS_USERNAME}" \
    --dbname="${RDS_DATABASE}" \
    --data-only \
    --no-owner \
    --disable-triggers \
    /tmp/skillai.dump

log "Restore complete."

log "Cleaning up bastion pod ..."
kubectl delete pod/"${BASTION_POD}" --namespace="${NAMESPACE}" --wait=false

log "Cleaning up local dump file ..."
rm -f "${DUMP_FILE}"

log "Phase B complete — data restored to RDS."
log "Next step: run 70-uploads-sync.sh (sync upload files to EFS), then 80-deploy.sh."
