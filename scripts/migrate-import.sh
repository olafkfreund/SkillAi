#!/usr/bin/env bash
# =============================================================================
# SkillAI — Migration Import Script
# Run this on p620 AFTER cloning the repo and copying the bundle.
#
# Usage:
#   bash scripts/migrate-import.sh ~/skillai-migration-20250101_120000.tar.gz
# =============================================================================
set -euo pipefail

BUNDLE_FILE="${1:-}"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXTRACT_DIR="$HOME/skillai-migration-import-$$"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   SkillAI Migration Import               ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── 0. Validate arguments ─────────────────────────────────────────────────────
if [[ -z "$BUNDLE_FILE" ]]; then
  echo "Usage: bash scripts/migrate-import.sh <path-to-bundle.tar.gz>"
  echo ""
  echo "Example:"
  echo "  bash scripts/migrate-import.sh ~/skillai-migration-20250101_120000.tar.gz"
  exit 1
fi

if [[ ! -f "$BUNDLE_FILE" ]]; then
  echo "✗ Bundle file not found: $BUNDLE_FILE"
  exit 1
fi

echo "Project : $PROJECT_DIR"
echo "Bundle  : $BUNDLE_FILE"
echo ""

# ── 1. Pre-flight checks ──────────────────────────────────────────────────────
echo "▶ Checking prerequisites…"

if ! command -v docker &>/dev/null; then
  echo "✗ Docker not found. Install Docker first."
  exit 1
fi

if ! docker compose version &>/dev/null 2>&1; then
  echo "✗ Docker Compose not found (need v2+). Install Docker Desktop or docker-compose-plugin."
  exit 1
fi

echo "  ✓ Docker available"
echo "  ✓ Docker Compose available"

# ── 2. Extract bundle ─────────────────────────────────────────────────────────
echo ""
echo "▶ Extracting bundle…"

mkdir -p "$EXTRACT_DIR"
tar xzf "$BUNDLE_FILE" -C "$EXTRACT_DIR" --strip-components=1

DUMP_FILE="$EXTRACT_DIR/skillai.pgdump"
UPLOADS_FILE="$EXTRACT_DIR/uploads.tar.gz"

if [[ ! -f "$DUMP_FILE" ]]; then
  echo "✗ skillai.pgdump not found in bundle — is this the right file?"
  rm -rf "$EXTRACT_DIR"
  exit 1
fi

DUMP_SIZE=$(du -sh "$DUMP_FILE" | cut -f1)
echo "  ✓ Extracted ($DUMP_SIZE DB dump)"

# ── 3. Copy environment files ─────────────────────────────────────────────────
echo ""
echo "▶ Copying environment files…"

COPIED_ENV=0

if [[ -f "$EXTRACT_DIR/.env.local" ]]; then
  if [[ -f "$PROJECT_DIR/.env.local" ]]; then
    echo "  ℹ  .env.local already exists — skipping (keeping existing)"
  else
    cp "$EXTRACT_DIR/.env.local" "$PROJECT_DIR/.env.local"
    echo "  ✓ .env.local copied"
    COPIED_ENV=1
  fi
else
  echo "  ℹ  No .env.local in bundle — skipping"
fi

if [[ -f "$EXTRACT_DIR/.env" ]]; then
  if [[ -f "$PROJECT_DIR/.env" ]]; then
    echo "  ℹ  .env already exists — skipping (keeping existing)"
  else
    cp "$EXTRACT_DIR/.env" "$PROJECT_DIR/.env"
    echo "  ✓ .env copied"
    COPIED_ENV=1
  fi
else
  echo "  ℹ  No .env in bundle — skipping"
fi

if [[ ! -f "$PROJECT_DIR/.env.local" ]]; then
  echo ""
  echo "  ⚠  WARNING: No .env.local found in project directory."
  echo "     The app will fail to start without NEXTAUTH_SECRET and API keys."
  echo "     Copy your .env.local manually before starting the stack."
  echo ""
fi

# ── 4. Start the database container ──────────────────────────────────────────
echo ""
echo "▶ Starting database container…"

cd "$PROJECT_DIR"

docker compose up -d db

echo "  ✓ DB container started — waiting for PostgreSQL to be ready…"

# Wait for DB to accept connections (up to 30 seconds)
MAX_WAIT=30
WAITED=0
until docker compose exec -T db pg_isready -U skillai -d skillai &>/dev/null 2>&1; do
  if [[ $WAITED -ge $MAX_WAIT ]]; then
    echo "  ✗ PostgreSQL did not become ready within ${MAX_WAIT}s"
    rm -rf "$EXTRACT_DIR"
    exit 1
  fi
  sleep 1
  WAITED=$((WAITED + 1))
done

echo "  ✓ PostgreSQL ready (waited ${WAITED}s)"

# ── 5. Ensure database exists ─────────────────────────────────────────────────
echo ""
echo "▶ Ensuring database exists…"

# The pgvector Docker image creates the DB from POSTGRES_DB env var on first run.
# Check if it already has tables (i.e. was previously initialised).
TABLE_COUNT=$(docker compose exec -T db psql -U skillai -d skillai -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null || echo "0")

if [[ "$TABLE_COUNT" -gt "0" ]]; then
  echo ""
  echo "  ⚠  The database already contains $TABLE_COUNT table(s)."
  echo ""
  read -r -p "     Overwrite existing data? This CANNOT be undone. [yes/no]: " CONFIRM
  if [[ "$CONFIRM" != "yes" ]]; then
    echo "  Aborted — no changes made."
    rm -rf "$EXTRACT_DIR"
    exit 0
  fi

  echo "  Dropping existing schema…"
  docker compose exec -T db psql -U skillai -d skillai -c \
    "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" &>/dev/null
  echo "  ✓ Schema cleared"
else
  echo "  ✓ Database is empty — proceeding with restore"
fi

# ── 6. Restore the database dump ─────────────────────────────────────────────
echo ""
echo "▶ Restoring PostgreSQL dump…"

# Copy dump into container, restore, then remove
docker cp "$DUMP_FILE" skillai-db-1:/tmp/skillai-restore.pgdump

docker compose exec -T db pg_restore \
  -U skillai \
  -d skillai \
  --no-owner \
  --no-acl \
  --exit-on-error \
  /tmp/skillai-restore.pgdump

docker compose exec -T db rm -f /tmp/skillai-restore.pgdump

echo "  ✓ Database restored"

# ── 7. Re-enable Row Level Security ──────────────────────────────────────────
echo ""
echo "▶ Re-enabling Row Level Security on restored tables…"

# pg_restore with --no-acl doesn't run ENABLE ROW LEVEL SECURITY.
# Re-run it for all tables that have RLS policies.
docker compose exec -T db psql -U skillai -d skillai -c "
DO \$\$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT DISTINCT tablename
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
  END LOOP;
END;
\$\$;" &>/dev/null

echo "  ✓ RLS re-enabled"

# ── 8. Import uploads volume ──────────────────────────────────────────────────
echo ""
echo "▶ Importing uploads volume…"

UPLOADS_SIZE=$(du -sh "$UPLOADS_FILE" | cut -f1)

if [[ "$UPLOADS_SIZE" == "0"* ]] || [[ $(wc -c < "$UPLOADS_FILE") -lt 100 ]]; then
  echo "  ℹ  Uploads archive is empty — skipping"
else
  # Ensure the named volume exists by starting the app briefly or using alpine
  docker run --rm \
    -v skillai_uploads_data:/data \
    -v "$EXTRACT_DIR":/backup:ro \
    alpine \
    tar xzf /backup/uploads.tar.gz -C /data

  echo "  ✓ Uploads imported ($UPLOADS_SIZE)"
fi

# ── 9. Clean up extracted bundle ─────────────────────────────────────────────
rm -rf "$EXTRACT_DIR"

# ── 10. Start the full stack ──────────────────────────────────────────────────
echo ""
echo "▶ Starting full application stack…"

docker compose up -d --build

echo "  ✓ Stack started"

# Wait for app to respond (up to 60 seconds)
echo ""
echo "▶ Waiting for app to become ready…"
MAX_WAIT=60
WAITED=0

until curl -sf http://localhost:3000/api/health &>/dev/null 2>&1; do
  if [[ $WAITED -ge $MAX_WAIT ]]; then
    echo "  ℹ  App did not respond on :3000 within ${MAX_WAIT}s"
    echo "     Check logs: docker compose logs -f app"
    break
  fi
  sleep 2
  WAITED=$((WAITED + 2))
done

if curl -sf http://localhost:3000/api/health &>/dev/null 2>&1; then
  echo "  ✓ App is responding at http://localhost:3000"
fi

# ── 11. Summary ───────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   Import complete ✓                      ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "  App     : http://localhost:3000"
echo "  DB port : 5433 (localhost → container 5432)"
echo ""
echo "Next steps:"
echo "  1. Open http://localhost:3000 and log in"
echo "  2. Verify your candidates and roles are present"
echo "  3. Run a test AI scoring to confirm API keys work"
echo ""
echo "Useful commands:"
echo "  docker compose logs -f app          # App logs"
echo "  docker compose logs -f db           # DB logs"
echo "  docker compose ps                   # Container status"
echo "  docker compose down                 # Stop everything"
echo ""
