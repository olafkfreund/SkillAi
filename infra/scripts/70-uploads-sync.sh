#!/usr/bin/env bash
# infra/scripts/70-uploads-sync.sh
# Sync the local ./uploads/ directory to the EFS volume via a temporary helper pod.
#
# Strategy:
#   1. Write a Pod manifest that mounts the EFS PVC (must already exist in the cluster)
#      and runs busybox so we can copy files into it.
#   2. Wait for the pod to be Ready.
#   3. Use `kubectl cp` to copy all files from ./uploads/ into the pod's /efs mount.
#   4. Verify file count matches.
#   5. Delete the helper pod.
#
# Prerequisites:
#   - kubectl context points at EKS cluster
#   - The `skillai` namespace and the `skillai-uploads` PVC already exist.
#     (They are created by `kubectl apply -k infra/k8s/base/` or by 80-deploy.sh.)
#     If the namespace/PVC don't exist yet, run:
#       kubectl apply -f infra/k8s/base/namespace.yaml
#       kubectl apply -f infra/k8s/base/pvc.yaml
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# shellcheck source=/dev/null
eval "$(direnv export bash 2>/dev/null)" || source "${REPO_ROOT}/.envrc"

log() { echo "[uploads-sync] $(date -u +%H:%M:%SZ) $*"; }

NAMESPACE="skillai"
PVC_NAME="skillai-uploads"
HELPER_POD="skillai-uploads-helper"
LOCAL_UPLOADS="${REPO_ROOT}/uploads"

command -v kubectl &>/dev/null || { echo "[uploads-sync] ERROR: kubectl not found."; exit 1; }

if [[ ! -d "${LOCAL_UPLOADS}" ]]; then
  echo "[uploads-sync] WARN: ${LOCAL_UPLOADS} does not exist or is empty."
  echo "[uploads-sync]       Nothing to sync."
  exit 0
fi

LOCAL_COUNT="$(find "${LOCAL_UPLOADS}" -type f | wc -l | tr -d ' ')"
log "Local uploads directory: ${LOCAL_UPLOADS} (${LOCAL_COUNT} files)"

if [[ "${LOCAL_COUNT}" -eq 0 ]]; then
  log "No files to sync — skipping."
  exit 0
fi

# ---------------------------------------------------------------------------
# Verify PVC exists before creating the helper pod
# ---------------------------------------------------------------------------
if ! kubectl get pvc "${PVC_NAME}" -n "${NAMESPACE}" &>/dev/null; then
  echo "[uploads-sync] ERROR: PVC '${PVC_NAME}' not found in namespace '${NAMESPACE}'."
  echo "[uploads-sync]        Create it first:"
  echo "[uploads-sync]          kubectl apply -f infra/k8s/base/namespace.yaml"
  echo "[uploads-sync]          kubectl apply -f infra/k8s/base/pvc.yaml"
  exit 1
fi

# ---------------------------------------------------------------------------
# Clean up any stale helper pod from a previous run
# ---------------------------------------------------------------------------
if kubectl get pod "${HELPER_POD}" -n "${NAMESPACE}" &>/dev/null; then
  log "Deleting stale helper pod from previous run ..."
  kubectl delete pod "${HELPER_POD}" -n "${NAMESPACE}" --wait=true --grace-period=5 2>/dev/null || true
fi

# ---------------------------------------------------------------------------
# Spin up helper pod
# ---------------------------------------------------------------------------
log "Creating helper pod (mounts PVC at /efs) ..."
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: ${HELPER_POD}
  namespace: ${NAMESPACE}
  labels:
    app: uploads-helper
spec:
  restartPolicy: Never
  containers:
  - name: helper
    image: busybox:1.36
    command: ["sh", "-c", "while true; do sleep 3600; done"]
    volumeMounts:
    - name: uploads
      mountPath: /efs
  volumes:
  - name: uploads
    persistentVolumeClaim:
      claimName: ${PVC_NAME}
EOF

log "Waiting for helper pod to be Ready (may take ~30s while EFS mounts) ..."
kubectl wait pod/"${HELPER_POD}" \
  --namespace="${NAMESPACE}" \
  --for=condition=Ready \
  --timeout=120s

# ---------------------------------------------------------------------------
# Copy files
# ---------------------------------------------------------------------------
log "Copying ${LOCAL_COUNT} files from ${LOCAL_UPLOADS} to ${HELPER_POD}:/efs/ ..."
log "This may take a few minutes depending on upload volume."
kubectl cp "${LOCAL_UPLOADS}/." "${NAMESPACE}/${HELPER_POD}:/efs/"

# ---------------------------------------------------------------------------
# Verify file count
# ---------------------------------------------------------------------------
log "Verifying file count in EFS ..."
REMOTE_COUNT="$(kubectl exec -n "${NAMESPACE}" "${HELPER_POD}" -- \
  find /efs -type f | wc -l | tr -d ' ' || echo "0")"

log "Local files : ${LOCAL_COUNT}"
log "Remote files: ${REMOTE_COUNT}"

if [[ "${REMOTE_COUNT}" -lt "${LOCAL_COUNT}" ]]; then
  echo "[uploads-sync] WARN: Remote file count (${REMOTE_COUNT}) < local count (${LOCAL_COUNT})."
  echo "[uploads-sync]       Some files may not have synced. Re-run this script to retry."
else
  log "File count verified — all ${LOCAL_COUNT} files synced successfully."
fi

# ---------------------------------------------------------------------------
# Tear down helper pod
# ---------------------------------------------------------------------------
log "Deleting helper pod ..."
kubectl delete pod "${HELPER_POD}" -n "${NAMESPACE}" --wait=false

log "Uploads sync complete."
log "Next step: run 80-deploy.sh to deploy the application."
