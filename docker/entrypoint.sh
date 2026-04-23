#!/bin/sh
set -e

# Fix ownership of uploads volume (Docker mounts as root)
chown -R nextjs:nodejs /app/uploads 2>/dev/null || true

# Drop to nextjs user and run the app
exec su-exec nextjs node /app/server.js
