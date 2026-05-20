#!/usr/bin/env bash
# infra/scripts/30-platform-install.sh
# Install cluster-wide platform components:
#   1. EFS CSI driver
#   2. EFS StorageClass
#   3. NGINX Ingress Controller (via Helm, NLB-backed)
#   4. cert-manager
#   5. ClusterIssuer (Let's Encrypt HTTP-01)
# Idempotent — safe to re-run.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TF_DIR="${REPO_ROOT}/infra/terraform"
PLATFORM_DIR="${REPO_ROOT}/infra/k8s/platform"

# shellcheck source=/dev/null
eval "$(direnv export bash 2>/dev/null)" || source "${REPO_ROOT}/.envrc"

log() { echo "[platform] $(date -u +%H:%M:%SZ) $*"; }

command -v kubectl &>/dev/null || { echo "[platform] ERROR: kubectl not found."; exit 1; }
command -v helm    &>/dev/null || { echo "[platform] ERROR: helm not found."; exit 1; }

if [[ ! -d "${TF_DIR}" ]]; then
  echo "[platform] ERROR: ${TF_DIR} not found. Run 10-terraform-apply.sh first."
  exit 1
fi

cd "${TF_DIR}"

# ---------------------------------------------------------------------------
# Read Terraform outputs
# ---------------------------------------------------------------------------
log "Reading Terraform outputs ..."
EFS_ID="$(terraform output -raw efs_id)"

if [[ -z "${EFS_ID}" ]]; then
  echo "[platform] ERROR: efs_id output is empty. Did terraform apply succeed?"
  exit 1
fi
log "EFS ID: ${EFS_ID}"

# ---------------------------------------------------------------------------
# Step 1 — EFS CSI driver
# ---------------------------------------------------------------------------
log "Step 1/5 — Installing AWS EFS CSI driver ..."
kubectl apply -k "github.com/kubernetes-sigs/aws-efs-csi-driver/deploy/kubernetes/overlays/stable/?ref=release-2.0"

log "Waiting for EFS CSI driver pods to be ready ..."
kubectl rollout status daemonset/efs-csi-node       -n kube-system --timeout=120s || true
kubectl rollout status deployment/efs-csi-controller -n kube-system --timeout=120s || true

# ---------------------------------------------------------------------------
# Step 2 — EFS StorageClass
# ---------------------------------------------------------------------------
log "Step 2/5 — Applying EFS StorageClass (EFS_ID=${EFS_ID}) ..."

SC_FILE="${PLATFORM_DIR}/efs-csi-storageclass.yaml"
if [[ ! -f "${SC_FILE}" ]]; then
  echo "[platform] ERROR: ${SC_FILE} not found."
  echo "[platform]        The k8s platform files should be written by the k8s-manifests agent."
  exit 1
fi

# Substitute __EFS_ID__ placeholder
TMP_SC="$(mktemp)"
sed "s/__EFS_ID__/${EFS_ID}/g" "${SC_FILE}" > "${TMP_SC}"
kubectl apply -f "${TMP_SC}"
rm -f "${TMP_SC}"

# ---------------------------------------------------------------------------
# Step 3 — NGINX Ingress Controller
# ---------------------------------------------------------------------------
log "Step 3/5 — Installing NGINX Ingress Controller via Helm ..."
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx 2>/dev/null || true
helm repo update

NGINX_VALUES="${PLATFORM_DIR}/nginx-ingress.values.yaml"
if [[ ! -f "${NGINX_VALUES}" ]]; then
  echo "[platform] ERROR: ${NGINX_VALUES} not found."
  exit 1
fi

helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace \
  --values "${NGINX_VALUES}" \
  --wait \
  --timeout 300s

# ---------------------------------------------------------------------------
# Step 4 — cert-manager
# ---------------------------------------------------------------------------
log "Step 4/5 — Installing cert-manager v1.16.5 ..."
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.16.5/cert-manager.yaml

log "Waiting for cert-manager webhook to be ready ..."
kubectl rollout status deployment/cert-manager            -n cert-manager --timeout=180s
kubectl rollout status deployment/cert-manager-webhook    -n cert-manager --timeout=180s
kubectl rollout status deployment/cert-manager-cainjector -n cert-manager --timeout=180s

# Brief extra wait for the webhook TLS to stabilise — ClusterIssuer creation can
# fail with "connection refused" if applied too quickly after rollout complete.
sleep 15

# ---------------------------------------------------------------------------
# Step 5 — ClusterIssuer
# ---------------------------------------------------------------------------
log "Step 5/5 — Applying Let's Encrypt ClusterIssuer ..."

ISSUER_FILE="${PLATFORM_DIR}/cluster-issuer.yaml"
if [[ ! -f "${ISSUER_FILE}" ]]; then
  echo "[platform] ERROR: ${ISSUER_FILE} not found."
  exit 1
fi
kubectl apply -f "${ISSUER_FILE}"

# ---------------------------------------------------------------------------
# Print NLB address for the operator
# ---------------------------------------------------------------------------
log "Waiting for NLB hostname/IP to be assigned (may take ~2 min) ..."
NLB_ADDR=""
for i in $(seq 1 24); do
  NLB_ADDR=$(kubectl get svc ingress-nginx-controller \
    -n ingress-nginx \
    -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || true)
  if [[ -z "${NLB_ADDR}" ]]; then
    # Try IP field as fallback (NLBs usually give hostname, but check both)
    NLB_ADDR=$(kubectl get svc ingress-nginx-controller \
      -n ingress-nginx \
      -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)
  fi
  if [[ -n "${NLB_ADDR}" ]]; then
    break
  fi
  log "  Waiting (attempt ${i}/24) ..."
  sleep 5
done

echo ""
if [[ -n "${NLB_ADDR}" ]]; then
  # Resolve NLB hostname to an IP for nip.io DNS (AWS NLBs return a hostname)
  NLB_IP="$(dig +short "${NLB_ADDR}" | grep -Eo '([0-9]{1,3}\.){3}[0-9]{1,3}' | head -n1 || true)"
  echo "[platform] =============================================="
  echo "[platform]  NLB address : ${NLB_ADDR}"
  if [[ -n "${NLB_IP}" ]]; then
    echo "[platform]  NLB IP      : ${NLB_IP}"
    echo "[platform]  nip.io URL  : https://${NLB_IP}.nip.io"
    echo ""
    echo "[platform]  ACTION REQUIRED:"
    echo "[platform]  1. Set NEXTAUTH_URL=${NLB_IP}.nip.io in your .envrc"
    echo "[platform]  2. Set APP_URL=https://${NLB_IP}.nip.io"
    echo "[platform]  3. Set NEXT_PUBLIC_APP_URL=https://${NLB_IP}.nip.io"
    echo "[platform]  4. Run 50-render-secret.sh to regenerate the k8s Secret"
  else
    echo "[platform]  Could not resolve NLB IP via DNS — try again in a minute."
    echo "[platform]  Run: dig +short ${NLB_ADDR}"
  fi
  echo "[platform] =============================================="
else
  echo "[platform] WARN: NLB address not yet assigned after 2 minutes."
  echo "[platform]       Check: kubectl get svc ingress-nginx-controller -n ingress-nginx"
fi

log "Platform install complete."
