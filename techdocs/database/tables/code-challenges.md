# code_challenges

_Schema reference for the code_challenges table._

> **ℹ️ Note**
>
> Auto-generated from `src/db/schema/code-challenges.ts`. **9** columns. To regenerate locally, run `npm run docs:gen:db` from `docs-site/`.

## Columns

| Column | Type | Constraints | Default | References |
|---|---|---|---|---|
| `id` | `uuid` | `PRIMARY KEY` | `gen_random_uuid()` | — |
| `pack_id` | `uuid` | `NOT NULL` `UNIQUE` | — | `interviewPacks.id` |
| `title` | `varchar(200)` | `NOT NULL` | — | — |
| `problem_description` | `text` | `NOT NULL` | — | — |
| `starter_code` | `text` | `NOT NULL` | — | — |
| `language` | `varchar(50)` | `NOT NULL` | `'typescript'` | — |
| `unit_tests` | `text` | — | — | — |
| `evaluation_criteria` | `text` | — | — | — |
| `estimated_minutes` | `integer` | — | — | — |

**Drizzle name:** `codeChallenges` (imported as `import { codeChallenges } from '@/db/schema'`).
