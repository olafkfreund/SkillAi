# Setup Guide

This guide covers local development setup, Docker deployment, and environment configuration.

---

## Prerequisites

Before starting, ensure the following are installed:

- Node.js 22 LTS or later
- Docker and Docker Compose
- Git
- An Anthropic API key (required for AI scoring)
- A Google AI (Gemini) API key (required for embeddings and Gemini scoring)
- PostgreSQL client tools (optional, for direct DB access)

---

## Local Development

### 1. Clone the repository

```bash
git clone https://github.com/olafkfreund/SkillAi.git
cd SkillAi
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy the example file and fill in the required values:

```bash
cp .env.example .env.local
```

Open `.env.local` in a text editor and set the following:

```
DATABASE_URL=postgresql://skillai:skillai@localhost:5433/skillai

NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<generate with: openssl rand -base64 32>
AUTH_SECRET=<same value as NEXTAUTH_SECRET>

ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AIza...

UPLOAD_DIR=./uploads

ENCRYPTION_KEY=<generate with: openssl rand -hex 32>
```

The `ENCRYPTION_KEY` is used to encrypt per-tenant AI API keys stored in the database.

### 4. Start the database

```bash
docker compose up -d db
```

This starts PostgreSQL 17 with the pgvector extension on port 5433 (to avoid conflicts with any local PostgreSQL instance).

### 5. Push the schema and seed data

```bash
npm run db:push
npm run db:seed
```

The seed script creates a default tenant, an admin user, and a recruiter user. Credentials are printed to the terminal.

### 6. Start the development server

```bash
npm run dev
```

Open http://localhost:3000. The first visit redirects to the login page.

---

## Docker Deployment

For a self-contained deployment where both the application and database run in containers:

```bash
cp .env.example .env.local
# Edit .env.local as above
docker compose up --build
```

The application is available at http://localhost:3000.

In this mode:
- The database is accessible at `db:5432` from within the container network
- Set `DATABASE_URL=postgresql://skillai:skillai@db:5432/skillai` in `.env.local`
- Uploaded files are stored in the `uploads` Docker volume

### Running migrations in Docker

```bash
docker compose exec app npm run db:push
docker compose exec app npm run db:seed
```

### Host-folder inbox worker (optional)

The `worker` Compose service watches a host-mounted folder and auto-ingests CVs
dropped into it — no web upload needed (issue #4 / Epic #3, Phase 1).

- Layout: drop CVs into `INBOX_ROOT/<tenantId>/`. Each tenant gets its own
  subfolder (named by its UUID). Supported: PDF, DOCX, ODT, RTF, TXT, MD.
- Handled files are moved into `<tenantId>/.processed/` (success) or
  `<tenantId>/.failed/` (rejected) so nothing is ingested twice.
- Ingested CVs land in the candidate archive (role-less) and get embedding +
  CV-profile extraction automatically.

```bash
docker compose up -d worker         # start it
docker compose logs -f worker       # watch ingestion
```

Run it locally without Docker via `npm run worker`. Configuration:

| Variable | Default | Purpose |
|---|---|---|
| `INBOX_ROOT` | `<cwd>/inbox` (Docker: `/app/inbox`) | Root folder scanned for per-tenant subfolders |
| `INGEST_POLL_MS` | `30000` (floor 5000) | How often the folder is polled |

Run a single worker instance (the Compose service is `scale=1`); multi-replica
leader election is not yet implemented.

---

## Production Considerations

### Database

- Use a managed PostgreSQL 17 instance with the pgvector extension enabled
- Enable automated daily backups
- Set `DATABASE_URL` to the production connection string with SSL enabled

### File storage

- For production, configure S3-compatible storage (the project includes support for Garage, a self-hosted S3-compatible server)
- Set `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, and `STORAGE_BUCKET` environment variables

### HTTPS

- Place a reverse proxy such as Caddy or Nginx in front of the application
- Set `NEXTAUTH_URL` to the production HTTPS URL

### Environment variables

All secrets must be injected via environment variables. Never commit `.env.local` or any file containing real credentials. The `.gitignore` already excludes all `.env*` files.

---

## Environment Variable Reference

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `NEXTAUTH_URL` | Yes | Full URL of the application (e.g. https://skills.example.com) |
| `NEXTAUTH_SECRET` | Yes | Random secret for JWT signing |
| `AUTH_SECRET` | Yes | Same as NEXTAUTH_SECRET |
| `ANTHROPIC_API_KEY` | Yes | Anthropic Claude API key |
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `ENCRYPTION_KEY` | Yes | 32-byte hex key for encrypting stored API keys |
| `UPLOAD_DIR` | No | Local upload directory (default: ./uploads) |
| `BRAVE_SEARCH_API_KEY` | No | Brave Search API key for candidate web intelligence |
| `NEXT_PUBLIC_APP_URL` | No | Public base URL of the deployment; used to build the OAuth `redirect_uri`. Defaults to `http://localhost:3000` |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID for Google Calendar integration |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth client secret |
| `MICROSOFT_CLIENT_ID` | No | Microsoft OAuth client ID for Outlook Calendar integration |
| `MICROSOFT_CLIENT_SECRET` | No | Microsoft OAuth client secret |
| `MICROSOFT_TENANT_ID` | No | Microsoft directory (tenant) ID. Defaults to `common` (multi-tenant + personal accounts); set to a directory GUID for single-tenant apps |

The OAuth redirect URI registered with Google or Microsoft must exactly match `${NEXT_PUBLIC_APP_URL}/api/auth/calendar/{google|microsoft}/callback`. For step-by-step setup of the Google and Microsoft OAuth apps — including the redirect-URI gotcha and a troubleshooting table — see the in-app help article **"Calendar OAuth credentials (Google + Microsoft)"** under Settings & Admin.

---

## Database Management

The project uses Drizzle ORM with the following commands:

```bash
npm run db:push       # Push schema changes directly (development)
npm run db:generate   # Generate a migration file
npm run db:migrate    # Run pending migrations (production)
npm run db:seed       # Seed initial data
npm run db:studio     # Open Drizzle Studio (visual DB browser)
```

For development, `db:push` is the fastest way to apply schema changes. For production deployments, generate and run proper migration files with `db:generate` and `db:migrate`.

---

## Data Export & Backup Policy

SkillAI operates two complementary backup mechanisms. Operators are responsible for the first; admins manage the second.

### Operator-level database backup (full backup)

The authoritative backup for all tenant data is a full PostgreSQL dump taken from the database service.

Recommended setup:

```bash
# Daily cron: dump the entire database and compress it
pg_dump "$DATABASE_URL" | gzip > /backups/skillai-$(date +%Y%m%d).sql.gz
```

For Docker deployments, run this against the `db` container:

```bash
docker compose exec db pg_dump -U skillai skillai | gzip > /backups/skillai-$(date +%Y%m%d).sql.gz
```

To restore from a dump:

```bash
gunzip -c /backups/skillai-20260101.sql.gz | psql "$DATABASE_URL"
```

Recommended cadence: daily. Retain at least 30 rolling dumps. Store backups off-site in encrypted storage separate from the application host.

Uploaded CV files and logos are stored in the `uploads` Docker volume (or an S3-compatible store in production). Back up the volume separately — it is not captured by `pg_dump`.

### Admin-level per-tenant export (in-app)

Admins can download a per-tenant JSON export from the Settings page ("Backups & Data Export" card). This produces a ZIP containing one JSON file per database table, scoped to the tenant, plus a `manifest.json`.

This export is:
- **Self-service** — no operator involvement needed
- **Portable** — a single ZIP file readable outside the application
- **GDPR-friendly** — can serve as a Subject Access Request response for your organisation's own data

Recommended cadence: weekly manual export by an admin. Retain exports for at least **2 years** to satisfy common GDPR and employment records obligations (verify the exact requirement for your jurisdiction).

Per-tenant exports are **downloaded to the admin's browser** and are not stored server-side. The operator has no visibility into how many times an admin has exported, except via the audit log (`tenant.exported` action).

### What is NOT in the per-tenant export

- Binary files (CV PDFs, logos) — paths are in the JSON; the binaries remain on disk
- Other tenants' data — each export is scoped to a single tenant via RLS
- The `tenants` table itself — contains only the tenant's own metadata row, not useful in this context
- The `calendar_connections` table — per-user, not per-tenant

For a full account of what is included, see the in-app help article **"Backups and data export"** under Settings & Admin.

### Restore from export

Restore-from-export (importing the ZIP back into the app) is **not yet available in-app**. A future PR will deliver this. For now:

- For full restores, operators use `pg_restore` / `psql` against a `pg_dump` backup.
- For partial recovery (e.g. deleted candidates), read the JSON directly to extract specific rows and re-insert via the UI or API.

---

## Default Credentials

The seed script creates the following users on first run:

| Role | Email | Password |
|---|---|---|
| Admin | admin@skillai.internal | admin1234 |
| Recruiter | recruiter@skillai.internal | recruiter1234 |

Change these credentials immediately in any non-local environment.
