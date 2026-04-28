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

## Default Credentials

The seed script creates the following users on first run:

| Role | Email | Password |
|---|---|---|
| Admin | admin@skillai.internal | admin1234 |
| Recruiter | recruiter@skillai.internal | recruiter1234 |

Change these credentials immediately in any non-local environment.
