<!-- This page is seeded from README.md. Edit either file;
     they diverge by design after the initial onboarding. -->

# SkillAI

An open-source, self-hosted AI-powered recruiting portal that helps teams rank, compare, and archive candidates against job roles using Claude and Gemini as the underlying models.

Licensed under the GNU General Public License v3.0.

---

## Vision

Recruiting teams drown in CV volume. A typical open role attracts 50 to 200 applications, each requiring manual reading, inconsistent scoring, and no searchable history when the role closes. Tools like Greenhouse, Lever, and Workday solve workflow problems but do not solve the core ranking problem, and they cost tens of thousands of pounds per year while sending sensitive candidate data to third-party infrastructure.

SkillAI takes a narrower, sharper position: make ranking fast, explainable, and reusable, on infrastructure you control.

The goal is not to replace an ATS. The goal is to give any recruiter or hiring manager a ten-second answer to the question "who are the best candidates for this role and why?" while keeping every CV, score, and note entirely within the team's own systems.

---

## What It Does

- Accepts CV uploads in PDF, DOCX, ODT, TXT, and RTF formats
- Parses and stores CV text with structured formatting
- Scores candidates against role descriptions across four dimensions: technical skills, experience level, cultural fit, and communication
- Generates personalised interview question packs with scoring rubrics, follow-up questions, and optional code challenges
- Archives all candidates with scoring history so past candidates can be re-evaluated against future roles
- Provides semantic search across the candidate archive using vector embeddings
- Tracks recruitment agencies and their candidate submissions
- Supports multiple users per tenant with role-based access (admin, hiring manager, recruiter, viewer)
- Extracts skill and requirement tags from role descriptions for fast visual comparison
- Exports candidate profiles, shortlists, and interview packs as PDFs
- Supports Google Calendar and Microsoft Calendar integration for interview scheduling
- Routes shortlists through a hiring manager approval flow with sanitised candidate views (no rates, margins, or internal notes)
- Hosts an in-app help centre with persona-tagged articles surfaced to the right user
- Supports agency and customer logo branding on lists, detail headers, and PDF exports
- Ships with a light/dark theme toggle backed by a CSS-variable token system
- Exposes a full REST API (36 routes) plus an MCP server so claude-desktop and other MCP clients can read and act on SkillAI data

---

## Architecture in three sentences

SkillAI is a multi-tenant Next.js 16 web application backed by PostgreSQL 17 with pgvector, with row-level security enforced via the `app.tenant_id` session variable so cross-tenant reads are architecturally impossible. A REST + MCP API layer sits in the same Next.js process, sharing the same auth, scope, RLS, rate-limit, and audit primitives. The standalone `skillai-mcp` stdio bridge is the canonical way for claude-desktop to talk to a SkillAI instance — it is purely a transport adapter that forwards bearer-token-authenticated calls to `/api/mcp`.

---

## Connecting from claude-desktop and other MCP clients

### Why an MCP server

SkillAI is an internal tool deliberately scoped to one job: rank candidates fast. But recruiters increasingly want to compose their day around chat — "find me bench candidates who match this role, draft an introduction email for the top three, and schedule a screening call." Building email, scheduling, and shared-drive integrations into SkillAI would explode the scope and dilute the focus.

The MCP server takes the opposite approach. It exposes SkillAI's data and actions to any MCP-aware client (claude-desktop is the primary target) so users can compose workflows by combining SkillAI with whichever other MCP servers they already use — Gmail, Calendar, Drive, Slack, anything. SkillAI stays focused on ranking. Orchestration of multi-tool workflows lives in the LLM where it belongs.

### What it unlocks

Three concrete workflows that are now one chat message each:

- **Bench-to-role match.** "Find me available internal bench candidates who match the new platform engineering role at ACME Corp." The model calls `semantic_search_candidates`, filters by availability, and presents ranked matches inline.
- **Compose introduction email with attachments.** "Draft an intro email to recruiter@example.com for Bob Smith — attach his CV and the interview pack." The model calls `compose_candidate_email_attachments` to fetch the assets from SkillAI, then hands off to the Gmail MCP server to compose the draft.
- **Manager shortlist decisions.** "Approve Alice Doe and reject Bob Smith for the Senior Backend role with the note 'too junior for this band'." The model calls `approve_candidate` and `reject_candidate` — both are write-scoped tools and require `confirmed: true` so accidental approvals are not possible.

### Install

The bridge is published as a standalone `skillai-mcp` binary via [GitHub Releases](https://github.com/olafkfreund/SkillAi/releases). Pick the channel that matches your platform:

| Platform | Install |
|---|---|
| NixOS / Nix | `nix profile install github:olafkfreund/SkillAi?dir=skillai-mcp` |
| Linux (Debian/Ubuntu) | Download `skillai-mcp_<version>_amd64.deb` from Releases and `sudo dpkg -i` |
| Linux (RHEL/Fedora) | Download `skillai-mcp-<version>.x86_64.rpm` from Releases and `sudo rpm -i` |
| macOS / Linux / Windows | Download the matching pre-built binary from Releases and place on `$PATH` |

`npm` distribution is staged behind `NPM_TOKEN` and not currently published to the public registry — use the binary or Nix paths.

### Configure claude-desktop

Add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "skillai": {
      "command": "skillai-mcp",
      "env": {
        "SKILLAI_URL": "https://your-skillai-instance.example.com",
        "SKILLAI_TOKEN": "skl_prod_xxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

### Configure Claude Code

Claude Code can talk to `/api/mcp` directly over HTTP — no bridge install needed. The fastest path is the CLI:

```bash
claude mcp add --transport http --scope user skillai \
  https://your-skillai-instance.example.com/api/mcp \
  --header "Authorization: Bearer skl_prod_xxxxxxxxxxxxxxxxxxxxxxxx"
```

For a project-shared `.mcp.json`, the env-var pattern, and the stdio-bridge alternative, see the in-app help article *"Connecting SkillAi to Claude Code (MCP server)"*.

### Token generation

Tokens are minted in the SkillAI web UI at `/settings/api-tokens`. You choose a scope (`read`, `write`, or `admin`), give the token a name, and the secret is shown **once** — copy it into your client config immediately. Tokens are stored as argon2 hashes, never recoverable, and can be revoked at any time. Rate limits apply per-token and per-tenant.

See [`docs/mcp-tools.md`](docs/mcp-tools.md) for the full tool / resource / prompt catalogue (auto-generated; re-run `npm run docs:mcp-tools` after changes) and [`skillai-mcp/README.md`](skillai-mcp/README.md) for bridge install details.

---

## Screenshots

### Dashboard

![Dashboard home showing active roles, recent candidates, and scoring activity](docs/screenshots/01-dashboard.png)

### Candidate List

![Candidate list with AI scores, status filters, and semantic search](docs/screenshots/02-candidates-list.png)

### Candidate Profile

![Candidate profile showing AI dimension scores, notes, and interview history](docs/screenshots/03-candidate-profile.png)

### CV Display

![Structured CV display with section parsing and formatting](docs/screenshots/03b-candidate-cv.png)

### Roles List

![Roles list showing AI-extracted skill tags and requirement tags](docs/screenshots/04-roles-list.png)

### Role Detail

![Role detail with skill tags, requirement tags, and ranked candidate shortlist](docs/screenshots/05-role-detail.png)

### Agency Management

![Agency management showing linked candidates and assignment controls](docs/screenshots/06-agencies.png)

### Settings

![Settings panel for API key management and model selection](docs/screenshots/07-settings.png)

### Interview Pack

![AI-generated interview pack with personalised questions, scoring rubrics, and a code challenge](docs/screenshots/08-interview-pack.png)

---

## Technology Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router, React 19) |
| Language | TypeScript 5 |
| Database | PostgreSQL 17 with pgvector |
| ORM | Drizzle ORM |
| Authentication | Auth.js v5 (credentials, JWT, RBAC) |
| Primary AI | Anthropic Claude claude-sonnet-4-6 |
| Secondary AI | Google Gemini gemini-2.0-flash |
| Embeddings | Google Gemini text-embedding-001 |
| Styling | TailwindCSS 4 |
| Icons | Lucide React |
| Deployment | Docker Compose |

---

## Documentation

- [Setup Guide](docs/setup.md)
- [Architecture](docs/architecture.md)
- [Development Guide](docs/development.md)
- [Roadmap](docs/roadmap.md)

---

## Quick Start

```bash
git clone https://github.com/olafkfreund/SkillAi.git
cd SkillAi
cp .env.example .env.local
# Edit .env.local with your API keys
docker compose up -d db
npm install
npm run db:push
npm run db:seed
npm run dev
```

Open http://localhost:3000 and sign in with the seeded admin credentials printed in the terminal.

Full setup instructions are in [docs/setup.md](docs/setup.md).

---

## License

SkillAI is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

See the [LICENSE](LICENSE) file for the full text.
