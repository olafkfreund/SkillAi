# interview_questions

_Schema reference for the interview_questions table._

> **ℹ️ Note**
>
> Auto-generated from `src/db/schema/interview-questions.ts`. **13** columns. To regenerate locally, run `npm run docs:gen:db` from `docs-site/`.

## Columns

| Column | Type | Constraints | Default | References |
|---|---|---|---|---|
| `id` | `uuid` | `PRIMARY KEY` | `gen_random_uuid()` | — |
| `pack_id` | `uuid` | `NOT NULL` | — | `interviewPacks.id` |
| `question_type` | `questionTypeEnum` | `NOT NULL` | — | — |
| `difficulty` | `difficultyEnum` | `NOT NULL` | — | — |
| `question_text` | `text` | `NOT NULL` | — | — |
| `rationale` | `text` | — | — | — |
| `follow_ups` | `jsonb` | — | — | — |
| `strong_answer_signals` | `text` | — | — | — |
| `acceptable_answer_signals` | `text` | — | — | — |
| `weak_answer_signals` | `text` | — | — | — |
| `cv_references` | `text` | — | — | — |
| `order_index` | `integer` | `NOT NULL` | `0` | — |
| `notes` | `text` | — | — | — |

**Drizzle name:** `interviewQuestions` (imported as `import { interviewQuestions } from '@/db/schema'`).
