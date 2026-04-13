#!/usr/bin/env bash
# Stop all SkillAI services
set -e
cd "$(dirname "$0")/.."
echo "Stopping SkillAI..."
docker compose down
echo "Done."
