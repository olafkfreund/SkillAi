#!/usr/bin/env bash
# infra/scripts/90-verify.sh
# Verify the deployment is healthy:
#   - Poll /api/health until it returns 200 with db:ok
#   - Print kubectl get all, certificate, ingress in the skillai namespace
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# shellcheck source=/dev/null
eval "$(direnv export bash 2>/dev/null)" || source "${REPO_ROOT}/.envrc"

log() { echo "[verify] $(date -u +%H:%M:%SZ) $*"; }

NAMESPACE="skillai"
MAX_RETRIES=30
RETRY_SLEEP=5

# ---------------------------------------------------------------------------
# Derive health check URL from NEXTAUTH_URL
# ---------------------------------------------------------------------------
NEXTAUTH_URL="${NEXTAUTH_URL:-}"
if [[ -z "${NEXTAUTH_URL}" ]]; then
  echo "[verify] ERROR: NEXTAUTH_URL is not set in .envrc."
  exit 1
fi

BASE_URL="${NEXTAUTH_URL%/}"
HEALTH_URL="${BASE_URL}/api/health"
log "Health check URL: ${HEALTH_URL}"
log "Polling up to $((MAX_RETRIES * RETRY_SLEEP))s for TLS cert to be issued ..."

# ---------------------------------------------------------------------------
# Poll /api/health
# ---------------------------------------------------------------------------
HEALTHY=0
for i in $(seq 1 "${MAX_RETRIES}"); do
  HTTP_CODE="$(curl -sk -o /tmp/skillai-health.json -w '%{http_code}' "${HEALTH_URL}" || echo "000")"
  if [[ "${HTTP_CODE}" == "200" ]]; then
    RESPONSE="$(cat /tmp/skillai-health.json 2>/dev/null || echo '{}')"
    DB_STATUS="$(echo "${RESPONSE}" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("db","unknown"))' 2>/dev/null || echo "parse-error")"
    if [[ "${DB_STATUS}" == "ok" ]]; then
      HEALTHY=1
      break
    else
      log "  HTTP 200 but db=${DB_STATUS} (attempt ${i}/${MAX_RETRIES}) — waiting ..."
    fi
  else
    log "  HTTP ${HTTP_CODE} (attempt ${i}/${MAX_RETRIES}) — cert may still be pending ..."
  fi
  sleep "${RETRY_SLEEP}"
done

echo ""
if [[ "${HEALTHY}" -eq 1 ]]; then
  log "Health check PASSED"
  echo ""
  echo "Response from ${HEALTH_URL}:"
  python3 -m json.tool /tmp/skillai-health.json 2>/dev/null || cat /tmp/skillai-health.json
else
  echo "[verify] WARN: /api/health did not return db:ok after $((MAX_RETRIES * RETRY_SLEEP))s."
  echo "[verify]       Last response:"
  cat /tmp/skillai-health.json 2>/dev/null || echo "(no response)"
  echo ""
  echo "[verify] Troubleshooting hints:"
  echo "[verify]   - Certificate still pending? Check: kubectl get certificate -n ${NAMESPACE}"
  echo "[verify]   - App crashing?              Check: kubectl logs deployment/skillai-app -n ${NAMESPACE} --tail=50"
  echo "[verify]   - DB unreachable?            Check: kubectl exec -n ${NAMESPACE} deploy/skillai-app -- env | grep DATABASE_URL"
  echo ""
  echo "[verify] Continuing to print cluster state ..."
fi

# ---------------------------------------------------------------------------
# Print cluster state
# ---------------------------------------------------------------------------
echo ""
log "Cluster state in namespace '${NAMESPACE}':"
echo ""
kubectl get all,certificate,ingress -n "${NAMESPACE}" 2>/dev/null || \
  kubectl get all -n "${NAMESPACE}" 2>/dev/null || \
  echo "(kubectl get failed — check kubeconfig)"

echo ""
if [[ "${HEALTHY}" -eq 1 ]]; then
  log "Deployment verified successfully."
  log "Portal: ${BASE_URL}"
else
  log "Deployment verification INCOMPLETE — see hints above."
  exit 1
fi
