#!/usr/bin/env bash
# Start SkillAI: database, migrations, and app
set -e
cd "$(dirname "$0")/.."
echo "Starting SkillAI..."
docker compose up -d db
docker compose up -d migrate
docker compose up -d app
docker compose ps
echo ""
echo "App running at http://localhost:3000"
