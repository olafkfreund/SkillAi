# Roadmap

This document describes what has been built and what comes next.

---

## What Is Built

### Foundation

- Next.js 15 App Router with TypeScript, Drizzle ORM, PostgreSQL 17, and pgvector
- Docker Compose setup for local development and self-hosted deployment
- Multi-tenant architecture with Row-Level Security enforced at the database layer
- Auth.js v5 with credentials login, JWT sessions, and three-role RBAC (admin, recruiter, viewer)

### CV Handling

- Upload and parse CVs in PDF, DOCX, ODT, TXT, and RTF formats
- CV pre-processor that repairs flat text from PDF extraction and injects structure
- Structured CV display component with section detection, role history, bullet lists, and contact blocks

### AI Scoring

- Claude (claude-sonnet-4-6) as primary scoring model with structured tool-use output
- Gemini (gemini-2.0-flash, gemini-3.1-pro-preview) as secondary scoring model
- Per-tenant model selection (Claude or Gemini) via settings
- Four-dimension scoring: technical skills, experience level, cultural fit, communication
- Scoring background pipeline with polling and status display
- Per-tenant API key storage (encrypted) so each customer can use their own AI keys

### Interview Packs

- Two-stage AI pipeline: CV profile extraction, then personalised question generation
- 8 to 12 questions per pack with scoring rubrics (strong / acceptable / weak answer signals)
- Optional language-appropriate code challenge generation
- PDF export of complete interview pack
- Force-retry mechanism for packs interrupted by server restarts

### Role Management

- Role creation with title, description, and requirements
- AI extraction of skill tags and requirement tags from role text
- Customer framework level assignment (e.g. HSBC GCB bands)
- Role archiving
- PDF export of role description

### Candidate Management

- Candidate profile with scoring history across multiple roles
- Status management (new, reviewing, shortlisted, interviewing, offer, hired, rejected)
- Notes panel with timestamped entries
- Agency assignment and reassignment
- Archive (soft delete)
- Bulk CV upload
- Semantic search using Gemini embeddings and pgvector

### Comparison

- Side-by-side candidate comparison view
- Dimension score comparison across selected candidates

### Agencies

- Agency CRUD with contact details and notes
- Candidate-to-agency linkage
- Per-agency candidate list with assign and remove controls

### Exports

- Candidate profile PDF
- Role description PDF
- Shortlist PDF
- Interview pack PDF

### Web Intelligence

- Candidate web search using Brave Search API
- GitHub profile lookup
- Results stored per candidate for later reference

### Calendar Integration

- Google Calendar OAuth connection
- Microsoft Calendar OAuth connection
- Interview slot scheduling linked to candidates and roles

### Settings

- Per-tenant Anthropic and Google AI API key management
- Default AI model selection
- User invitation system

---

## What Comes Next

The following items are planned but not yet built.

### Short Term

**Semantic matching on role creation**
When a role is created or updated, automatically run a semantic similarity search and surface the top 10 matching candidates from the archive. The recruiter should see "You may already have suitable candidates" before uploading any new CVs.

**Candidate deduplication**
Detect when an uploaded CV closely matches an existing candidate profile using vector similarity. Present a "Possible duplicate" warning before creating a new record.

**Score comparison view improvements**
Allow selecting candidates from different roles in the comparison view. Add radar chart visualisation for dimension scores.

**Email notifications**
Send a notification when interview pack generation completes, when a candidate is shortlisted, or when a note is added. Use a simple SMTP configuration with no external service dependency.

### Medium Term

**Admin panel**
A dedicated admin interface for managing tenants, users, and system-wide settings. Currently admin operations require direct database access.

**Audit log**
Record all significant actions (login, upload, score, archive, status change) with user ID and timestamp, queryable from the admin panel.

**Agency performance reporting**
Aggregate scoring data by agency: average candidate score, shortlist rate, hire rate. Present as a simple table on the agency list page.

**Rate limiting**
Per-tenant AI API usage tracking and configurable limits to prevent runaway costs.

**Multi-language CV support**
Currently the system handles English CVs well. Structured parsing improvements for CVs written in other European languages are needed.

### Longer Term

**Self-hosted scoring fine-tuning**
Allow teams to provide examples of past hires and rejections to influence the scoring prompt, making the AI calibrate to their specific standards.

**Public API**
A token-authenticated REST API so SkillAI can be integrated with existing tools, job boards, or internal systems.

**Mobile-friendly interface**
The current interface is desktop-optimised. A responsive layout for tablet and mobile use would help hiring managers review shortlists on the go.

**Ollama integration**
Support for locally-hosted open-source models via Ollama as a third AI backend option, removing the dependency on external API services entirely for teams that require full data sovereignty.

---

## Design Principles for Future Development

Every new feature should satisfy at least one of these tests:

1. Does it make the recruiter faster at their core job (ranking and shortlisting)?
2. Does it reduce data loss (candidate history, notes, decisions)?
3. Does it improve explainability (why was this candidate ranked here)?

Features that add complexity without satisfying one of these should be deferred.

The application should remain deployable with a single `docker compose up` command. No mandatory external services beyond a PostgreSQL database and AI API keys.
