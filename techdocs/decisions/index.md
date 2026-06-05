# Decisions log

_Every architecturally-meaningful choice in SkillAI, with rationale, alternatives considered, and consequences. Override priority — highest._

Every architecturally-meaningful choice in SkillAI is logged here with rationale, alternatives considered, and consequences. **Override priority: highest.** These decisions trump anything in `CLAUDE.md` or contributor docs — if a contributor instruction conflicts with a decision below, the decision wins until it is formally superseded.

## The log

| ID | Date | Title | Category | Status |
|----|------|-------|----------|--------|
| [DEC-001](./dec-001-build-vs-buy.md) | 2026-04-09 | Initial product planning — build vs buy | Product | `Accepted` |
| [DEC-002](./dec-002-drizzle-over-prisma.md) | 2026-04-09 | Drizzle ORM over Prisma | Technical | `Accepted` |
| [DEC-003](./dec-003-row-level-security.md) | 2026-04-09 | Row-Level Security for multi-tenancy | Technical | `Accepted` |
| [DEC-004](./dec-004-claude-primary.md) | 2026-04-09 | Claude as primary AI, Gemini as secondary | Technical | `Accepted` |
| [DEC-005](./dec-005-storage.md) | 2026-04-09 | Local Docker volume + Garage for file storage | Technical | `Accepted` |
| [DEC-006](./dec-006-authjs-over-clerk.md) | 2026-04-09 | Auth.js v5 over Clerk for authentication | Technical | `Accepted` |
| [DEC-007](./dec-007-manual-transcript-upload.md) | 2026-04-10 | Manual file upload for interview transcripts | Product | `Accepted` |
| [DEC-008](./dec-008-manual-archive.md) | 2026-04-14 | Manual archive on role cut-off expiry | Product | `Accepted` |
| [DEC-009](./dec-009-soft-budget-signal.md) | 2026-04-14 | Soft AI signal for day-rate budget | Technical | `Accepted` |
| [DEC-010](./dec-010-internal-bench.md) | 2026-04-14 | Internal bench — orthogonal availability | Technical | `Accepted` |
| [DEC-011](./dec-011-gdpr-erasure.md) | 2026-04-28 | GDPR erasure — explicit deletes + audit redaction | Technical | `Accepted` |

> **ℹ️ Note — Proposing a new decision**
>
> Before opening a PR for a new decision:
>
> 1. **Read the existing decisions first** — many architectural questions are already answered. If a new decision contradicts an existing one, that existing one needs to be **superseded** (not silently ignored) — call it out explicitly in the PR.
> 2. **Follow the same template** — Decision · Context · Alternatives Considered · Rationale · Consequences (plus Implementation notes / Technical notes / Related feature when relevant).
> 3. **Use the next sequential `DEC-XXX` ID.** Stakeholders and date go in the metadata block at the top.
> 4. **Get sign-off in PR review** from at least one other engineer plus the product owner for `Product`-category decisions.
>
> The canonical source is [`/.agent-os/product/decisions.md`](https://github.com/olafkfreund/SkillAi/blob/main/.agent-os/product/decisions.md). The pages in this section are lifted verbatim from that file so the rationale never drifts.
