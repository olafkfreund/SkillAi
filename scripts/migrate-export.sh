#!/usr/bin/env bash
# =============================================================================
# SkillAI — Migration Export Script
# Run this on the CURRENT machine to bundle everything needed for p620.
# =============================================================================
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUNDLE_DIR="$HOME/skillai-migration"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BUNDLE_FILE="$HOME/skillai-migration-${TIMESTAMP}.tar.gz"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   SkillAI Migration Export               ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "Project : $PROJECT_DIR"
echo "Bundle  : $BUNDLE_FILE"
echo ""

# ── 1. Pre-flight checks ──────────────────────────────────────────────────────
echo "▶ Checking prerequisites…"

if ! command -v docker &>/dev/null; then
  echo "✗ Docker not found"; exit 1
fi

if ! docker compose -f "$PROJECT_DIR/docker-compose.yml" ps --quiet db 2>/dev/null | grep -q .; then
  echo "✗ skillai-db-1 container is not running. Start it with: docker compose up -d db"
  exit 1
fi

echo "  ✓ Docker running"
echo "  ✓ DB container up"

# ── 2. Create bundle directory ────────────────────────────────────────────────
rm -rf "$BUNDLE_DIR"
mkdir -p "$BUNDLE_DIR"

# ── 3. Dump the database ──────────────────────────────────────────────────────
echo ""
echo "▶ Dumping PostgreSQL database…"

docker exec skillai-db-1 pg_dump \
  -U skillai \
  -d skillai \
  --no-owner \
  --no-acl \
  --format=custom \
  --file=/tmp/skillai-dump.pgdump

docker cp skillai-db-1:/tmp/skillai-dump.pgdump "$BUNDLE_DIR/skillai.pgdump"
docker exec skillai-db-1 rm -f /tmp/skillai-dump.pgdump

DUMP_SIZE=$(du -sh "$BUNDLE_DIR/skillai.pgdump" | cut -f1)
echo "  ✓ Database dump complete ($DUMP_SIZE)"

# ── 4. Export the uploads volume ──────────────────────────────────────────────
echo ""
echo "▶ Exporting uploads volume…"

docker run --rm \
  -v skillai_uploads_data:/data:ro \
  -v "$BUNDLE_DIR":/backup \
  alpine \
  tar czf /backup/uploads.tar.gz -C /data . 2>/dev/null || {
    echo "  ℹ  Uploads volume is empty or does not exist — skipping"
    touch "$BUNDLE_DIR/uploads.tar.gz"
  }

UPLOADS_SIZE=$(du -sh "$BUNDLE_DIR/uploads.tar.gz" | cut -f1)
echo "  ✓ Uploads export complete ($UPLOADS_SIZE)"

# ── 5. Copy environment files ─────────────────────────────────────────────────
echo ""
echo "▶ Copying environment files…"

if [[ -f "$PROJECT_DIR/.env.local" ]]; then
  cp "$PROJECT_DIR/.env.local" "$BUNDLE_DIR/.env.local"
  echo "  ✓ .env.local copied"
else
  echo "  ✗ .env.local not found at $PROJECT_DIR — skipping"
fi

if [[ -f "$PROJECT_DIR/.env" ]]; then
  cp "$PROJECT_DIR/.env" "$BUNDLE_DIR/.env"
  echo "  ✓ .env copied"
else
  echo "  ℹ  No .env file found — skipping"
fi

# ── 6. Write a README into the bundle ────────────────────────────────────────
cat > "$BUNDLE_DIR/README.txt" << INNER
SkillAI Migration Bundle — created $TIMESTAMP
=============================================

Contents:
  skillai.pgdump   PostgreSQL custom-format dump (pg_restore compatible)
  uploads.tar.gz   CV file uploads from Docker volume
  .env.local       Next.js environment variables (secrets)
  .env             Docker Compose variable substitution file

To restore, run migrate-import.sh on the target machine.
INNER

# ── 7. Bundle everything into a tarball ───────────────────────────────────────
echo ""
echo "▶ Creating archive…"

tar czf "$BUNDLE_FILE" -C "$(dirname "$BUNDLE_DIR")" "$(basename "$BUNDLE_DIR")"
rm -rf "$BUNDLE_DIR"

BUNDLE_SIZE=$(du -sh "$BUNDLE_FILE" | cut -f1)

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   Export complete ✓                      ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "  Bundle : $BUNDLE_FILE"
echo "  Size   : $BUNDLE_SIZE"
echo ""
echo "Next steps:"
echo "  1. Copy bundle to p620:"
echo "     scp $BUNDLE_FILE olafkfreund@p620:~/"
echo ""
echo "  2. On p620, clone the repo and run the import script:"
echo "     git clone git@github.com:olafkfreund/SkillAi.git ~/Source/GitHub/SkillAi"
echo "     cd ~/Source/GitHub/SkillAi"
echo "     bash scripts/migrate-import.sh $BUNDLE_FILE"
echo ""
