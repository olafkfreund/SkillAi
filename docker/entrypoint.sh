#!/bin/sh
set -e

# Two ways this container gets started, and they need different handling.
#
# 1. As root (docker compose, plain `docker run`). The bind-mounted uploads
#    volume arrives owned by root, so it gets chowned, and then su-exec drops
#    to nextjs so the app never runs privileged.
#
# 2. Already as nextjs, because the platform said so (Kubernetes runAsUser).
#    Here su-exec is not just unnecessary, it is fatal: it calls setgroups(),
#    which needs CAP_SETGID. Measured on the live cluster (Factory#624) --
#    adding `capabilities: { drop: ["ALL"] }` to the Deployment, with or
#    without a uid change, killed the pod on every start with:
#
#        su-exec: setgroups: Operation not permitted
#
#    which is why skillai-app was still running on container-runtime defaults:
#    the obvious hardening patch crashloops it, and nothing said why.
#
# Branching on the uid we actually have keeps case 1 byte-for-byte unchanged,
# so this is a no-op until a deployment starts us as non-root.
if [ "$(id -u)" = "0" ]; then
  # Fix ownership of uploads volume (Docker mounts as root)
  chown -R nextjs:nodejs /app/uploads 2>/dev/null || true
  exec su-exec nextjs node /app/server.js
fi

# Already unprivileged: nothing to drop, nothing we are allowed to chown.
exec node /app/server.js
