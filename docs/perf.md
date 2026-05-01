# Performance characteristics

> Last updated: 2026-05-01 (issue #83)
>
> Where SkillAi is fast, where it'll start to hurt, and what to flip when.

## Current baseline

As of 2026-05-01 the working dataset is:

| Table | Row count |
|---|---:|
| audit_logs | 732 |
| interview_questions | 270 |
| candidates | 118 |
| ai_usage | 49 |
| scores | 43 |
| interview_packs | 31 |
| roles | 11 |

Everything below is a forward-looking sizing exercise, not a current pain point.

## Hot pages

### `/dashboard` — main dashboard

**Today (~100 candidates):** server time ~50–80 ms cold, ~5–15 ms cached.

**At 10k candidates:** target <500 ms p95 (issue #83 acceptance).

The dashboard issues three top-level fetches in parallel:

1. **`getForYouFeed`** — five sub-queries (interviews / awaiting score / stale priorities / expired roles / approvals) inside one `withTenant`, all in a single `Promise.all`.
2. **`getDashboardStats`** — five `count()` queries inside one `withTenant`, wrapped in `unstable_cache` with `revalidate: 60`. First load is one batch round-trip; subsequent loads within 60 s are zero round-trips.
3. **List queries** — four queries (recent roles / top candidates / recent uploads / upcoming interviews) inside one `withTenant` + `Promise.all`.

That's three `withTenant` calls instead of the eight sequential ones we had before issue #83.

Each `withTenant` opens a transaction and runs `SET app.tenant_id = …` for RLS. The 60 s stat cache is the highest-impact lever — after the first hit per tenant per minute, the stat-card row is free.

### `/dashboard/candidates` — candidates list

**Today (~100 candidates):** ~30–60 ms.

**At 10k candidates:** target <800 ms p95 (issue #83 acceptance).

Already structured as one `withTenant` + `Promise.all` across four sub-queries (rows / total count / agency list / bench count). The new `idx_candidates_tenant_active_created (tenant_id, is_active, created_at DESC)` covers the main row fetch; `idx_candidates_tenant_status_active` covers status-filtered views.

**Known weak spots that don't bite yet:**

- `LIMIT/OFFSET` pagination. At page 400 of a 10 000-row table, Postgres scans 9 999 rows just to skip them. Switch to keyset (`(created_at, id)` cursor) once page 50+ becomes a common entry point. URL shape changes when this lands.
- `count()` runs on every page load. With the new compound index it stays cheap up to ~50k rows. Past that, swap for `pg_class.reltuples` estimate or skip the count entirely and show "X+".
- `ilike '%q%'` substring search has no btree index support. Cheap until ~10k candidates; install `pg_trgm` and add a GIN trgm index past that.

## Indexes (post-#83)

Added in migration `0028_perf_indexes.sql`:

| Index | Table | Columns | Covers |
|---|---|---|---|
| `idx_candidates_tenant_active_created` | candidates | `(tenant_id, is_active, created_at DESC)` | Main candidates list query, dashboard "Recent uploads" |
| `idx_candidates_tenant_status_active` | candidates | `(tenant_id, status, is_active)` | Status-filtered candidate views |
| `idx_scores_status_updated` | scores | `(score_status, updated_at DESC)` | "Top candidates this week", "Scored this week" |
| `idx_roles_tenant_active_created` | roles | `(tenant_id, is_active, created_at DESC)` | Dashboard "Recent roles" widget |
| `idx_interview_slots_scheduled_status` | interview_slots | `(scheduled_at, status)` | Dashboard "Upcoming interviews" widget |
| `idx_interview_packs_status` | interview_packs | `(generation_status)` | Dashboard "Packs ready" stat |

Pre-existing indexes that remain load-bearing: `idx_candidates_tenant`, `idx_candidates_agency`, `idx_candidates_agency_availability`, `idx_scores_role_overall`, `idx_scores_candidate`, `idx_audit_logs_tenant_created`, `idx_audit_logs_entity`.

### Applying indexes in production

The migration uses plain `CREATE INDEX IF NOT EXISTS` because Drizzle wraps each migration file in an implicit transaction and `CREATE INDEX CONCURRENTLY` cannot run inside one. For a busy production table, run manually outside the migration tool:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_candidates_tenant_active_created
  ON candidates (tenant_id, is_active, created_at DESC);
-- ... repeat for each index
```

Then mark the migration as applied in `drizzle.__drizzle_migrations` so the migrator skips it. At current dev volumes the lock window is microseconds and the in-transaction approach is fine.

## When to flip the next switch

| Threshold | What to do | Why |
|---|---|---|
| Any table > **5 000 rows** | Install `pg_stat_statements` (requires `shared_preload_libraries` change + Postgres restart). Run a 1-week capture. | Operational visibility into actual slow queries — until you have real data, optimisation is guesswork. |
| Any table > **5 000 rows** | Run `ANALYZE` after the bulk import + nightly via cron. | Planner stats get stale fast on growing tables; bad stats produce bad plans. |
| candidates > **10 000** | Install `pg_trgm` extension; add `CREATE INDEX … USING GIN (lower(first_name \|\| ' ' \|\| last_name) gin_trgm_ops)`. | `ilike '%q%'` becomes index-backed. Without this, search starts dominating page time. |
| Common entry to candidates list past **page 50** | Switch from `LIMIT/OFFSET` to keyset pagination using `(created_at DESC, id DESC)` as the cursor. | Offset cost is linear with page number; keyset is O(log n) regardless. |
| candidates > **50 000** | Replace `count()` on the candidates list with `pg_class.reltuples` estimate (ANALYZE-driven). | Exact count becomes the dominant cost; estimate is microseconds and "showing 50k+" is fine UX. |
| audit_logs > **1 000 000** | Partition `audit_logs` by month; expire after 24 months unless legal-hold flag set. | Single-table audit log starts to dominate vacuum + index-rebuild times. |
| dashboard p95 > **500 ms** with the current cache | Lower `revalidate: 60` to `30` or move stats to a materialised view refreshed by cron. | The 60 s cache is the load-bearing performance feature; if you're missing it past target, the underlying queries got expensive — investigate before extending the TTL. |

## What we explicitly did NOT do in #83

- **`pg_stat_statements`** — operational lift (Postgres restart, monitoring tooling) outweighs value at <1 000 rows per table. Defer until any table crosses 5 000 rows.
- **`pg_trgm` for search** — unnecessary at current scale. Defer until candidates > 10 000.
- **Keyset pagination** — page 50 is unreachable today; URL shape change isn't worth it yet.
- **Background snapshot for stats** — `unstable_cache` with a 60 s TTL gives the same effective behaviour without scheduler infrastructure.
- **Bulk-loading benchmarks** — ran the math against the indexed query plans; defer synthetic load tests until production has real data to compare against.

## How to verify a query plan is index-backed

Inside the running container:

```bash
docker exec -it skillai-db-1 psql -U skillai -d skillai
```

Then in psql, set the tenant variable so RLS doesn't filter you out, and `EXPLAIN ANALYZE` the query:

```sql
SET app.tenant_id = '<your-tenant-uuid>';

EXPLAIN ANALYZE
SELECT id, first_name, last_name FROM candidates
WHERE tenant_id = '<tenant>'::uuid AND is_active = true
ORDER BY created_at DESC
LIMIT 25;
```

You want to see `Index Scan using idx_candidates_tenant_active_created` (or `Index Only Scan`) in the plan, not `Seq Scan`.

## Related

- Issue #83 — performance audit + caching layer
- Migration `0028_perf_indexes.sql` — the index additions documented above
- `src/app/(dashboard)/dashboard/page.tsx` — example of the parallel-fetch + cache pattern
