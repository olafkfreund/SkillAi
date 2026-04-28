---
title: "The candidate archive and semantic search"
category: "Roles & Candidates"
audience: ["recruiter", "admin"]
order: 13
lastUpdated: "2026-04-28"
tags: ["archive", "search", "semantic", "pgvector", "reuse"]
---

# The candidate archive and semantic search

Every candidate you upload to SkillAI is permanent. Even if they're rejected for the role they were uploaded against, they stay in the archive — searchable, re-rankable, and ready to be considered against the next role that opens.

## Why the archive matters

Industry data suggests 20–40% of past candidates are relevant to future roles. Without an archive, those candidates are effectively lost the moment one search closes. With it, you can:

- Pull a strong candidate from a closed role into a new one without re-uploading.
- See every role a person has been considered for and their score on each.
- Compare past pipelines across agencies, roles or time periods.
- Find a forgotten gem with a single semantic search query.

## Two ways to search

### Filter search (exact, structured)

The candidate list page has filters across the top:

- **Name / email** — substring match.
- **Status** — current pipeline status (most recent role).
- **Agency** — narrow to candidates from a specific source.
- **Availability** — `available`, `on_project`, `unavailable`.
- **Internal bench** — quick-filter for the internal `available` combo. See [Statuses and the bench](/dashboard/help/candidates-statuses-and-bench).
- **Score range, date range, role** — combine for finer queries.

Filters compose: every filter you add narrows the result set. Useful when you know what you're looking for.

### Semantic search (fuzzy, intent-based)

Open the **Semantic search** toggle (the brain icon, top-right of the candidate list). Type what you're actually looking for — in natural language:

- `senior frontend engineer with TypeScript and design-system experience`
- `Polish-speaking full-stack developer based in Berlin`
- `data engineer comfortable with dbt and Snowflake who's done team lead work`

Behind the scenes, your query is converted to an embedding and matched against the embeddings of every candidate's parsed CV using cosine similarity (pgvector + HNSW index). You get the top candidates by semantic similarity, plus a similarity score from 0 to 1.

Semantic search is good at:

- Finding candidates whose CV phrases their experience differently than your filter terms ("Python data work" matches "scientific computing in NumPy").
- Surfacing strong fits when you can't quite remember the right keyword.
- Rough role-matching across the archive without creating a role first.

It's less good at:

- Hard requirements. If you need someone with a specific certification or visa status, use filter search — semantic similarity will happily return close-but-not-exact matches.
- Tiny archives. If you only have 30 candidates total, filter search is faster.

## Reusing a candidate on a new role

Once you've found someone in the archive:

1. Open their candidate detail page.
2. Look at the **Matching roles** panel — SkillAI suggests open roles this candidate could fit, based on score similarity.
3. Or, on any open role, click **Add existing candidate** and pick them. They'll be scored against the new role within seconds.

The candidate's history (all roles, all scores, all notes) follows them. You can see it in the **Role history** panel on their profile.

## Privacy and access

Your archive is tenant-isolated — recruiters in other tenants on the same SkillAI instance cannot see your candidates. Within your tenant, all recruiters can see all candidates by default. Role-based access controls (admin, recruiter, viewer) determine who can edit vs read.

## See also

- [Tips for getting better rankings](/dashboard/help/tips-getting-better-rankings)
- [How AI scoring works](/dashboard/help/ai-how-scoring-works)
- [Statuses and the bench](/dashboard/help/candidates-statuses-and-bench)
