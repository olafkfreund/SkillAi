# Development Guide

This guide covers code conventions, the development workflow, adding new features, and contributing to the project.

---

## Development Workflow

```bash
# Start the database
docker compose up -d db

# Start the development server with hot reload
npm run dev

# Type-check without building
npx tsc --noEmit

# Push schema changes after editing src/db/schema/
npm run db:push

# Open the visual database browser
npm run db:studio
```

---

## Code Conventions

### TypeScript

All code is TypeScript with strict mode enabled. No `any` types except where the third-party SDK forces it (documented with a comment). Zod schemas validate all external inputs (form data, AI responses, API responses).

### Server actions

Server actions live in `src/actions/`. Each action:

1. Reads tenant ID, user ID, and role from HTTP headers set by the auth middleware
2. Validates input with a Zod schema
3. Performs its database operation inside `withTenant()` to enforce RLS
4. Returns a typed state object (never throws to the client)
5. Calls `revalidatePath()` after mutations

```typescript
'use server'

export async function myAction(_prev: MyState | null, formData: FormData): Promise<MyState> {
  const headersList = await headers()
  const tenantId = headersList.get('x-tenant-id')
  if (!tenantId) return { success: false, error: 'Unauthorized' }

  const parsed = MySchema.safeParse({ field: formData.get('field') })
  if (!parsed.success) return { success: false, error: 'Validation failed' }

  await withTenant(tenantId, async (tx) => {
    await tx.insert(myTable).values({ tenantId, ...parsed.data })
  })

  revalidatePath('/dashboard/my-page')
  return { success: true }
}
```

### Database schema

Schema files live in `src/db/schema/`. Each table has its own file. All tables include:

- `tenant_id UUID NOT NULL` referencing `tenants.id` with cascade delete
- Row-Level Security policy using `current_setting('app.tenant_id', true)::uuid`
- `.enableRLS()` on the table definition

After editing a schema file, run `npm run db:push` to apply changes to the local database.

### AI integration

AI clients live in `src/lib/ai/`. All AI calls use structured outputs (tool use for Anthropic, responseSchema for Gemini) so responses are always valid JSON matching a known Zod schema. Never parse unstructured text for data that needs to be stored.

Background AI tasks use `after()` from `next/server`:

```typescript
import { after } from 'next/server'

// In a server action, after saving the initial record:
after(async () => {
  await runMyAiTask(id, tenantId).catch((err) => {
    console.error('AI task error:', err)
  })
})
```

### Component patterns

Client components use `useActionState` for form submissions:

```typescript
const [state, action, pending] = useActionState<MyState | null, FormData>(
  myServerAction,
  null
)
```

Never call server actions manually from `useEffect`. Use form submissions or `useTransition` for one-shot mutations.

---

## Adding a New Feature

### 1. Database change

Add or modify a schema file in `src/db/schema/`. Export the new table from `src/db/schema/index.ts`. Run `npm run db:push`.

If the change needs a RLS policy, follow the pattern in existing schema files.

### 2. Server action

Add the action to an existing or new file in `src/actions/`. Follow the conventions above.

### 3. Server component (page)

Fetch data server-side using `withTenant()`. Pass serialisable data to client components as props. Do not pass Drizzle query result objects directly to client components — map them to plain objects first.

### 4. Client component

Client components handle interaction only. They receive data as props from the server component and call server actions via forms or `useTransition`.

---

## Project-Specific Rules

These rules are enforced by convention and code review:

- Never query the database without `withTenant()` (except for tables that are truly global, such as `tenants`)
- Never store AI API keys in plain text — use the encryption helpers in `src/lib/ai/keys.ts`
- Never commit `.env.local` or any file with real credentials
- Never use `sql`` ` raw queries except for the RLS session variable setter
- Always validate AI responses with the relevant Zod schema before using the data

---

## Making a Schema Change After Deployment

For a production database, never use `db:push` as it can destructively alter or drop columns. Instead:

1. Edit the schema file
2. Run `npm run db:generate` to generate a migration file in `src/db/migrations/`
3. Review the generated SQL
4. Run `npm run db:migrate` against the production database

---

## Debugging

### Interview pack stuck

If an interview pack is stuck in `pending` or `processing` status, it means the background `after()` task was interrupted (most likely by a hot reload in development).

To recover, open the pack's detail page. If it has been stuck for more than 3 minutes, a "Force retry" button appears. Click it to restart generation.

Alternatively, reset it directly:

```sql
UPDATE interview_packs
SET generation_status = 'failed',
    error_message = 'Manually reset for retry',
    updated_at = now()
WHERE id = '<pack-id>';
```

Then use the Retry button on the pack detail page.

### Checking AI errors

AI errors are logged to the server console with the pack or score ID. In Docker:

```bash
docker compose logs -f app
```

In development (npm run dev), errors appear directly in the terminal.

### Database access

```bash
# Connect directly (development)
PGPASSWORD=skillai psql -h localhost -p 5433 -U skillai -d skillai

# Via Docker
docker compose exec db psql -U skillai -d skillai
```

---

## Pull Request Guidelines

- Keep PRs focused on a single concern
- Include a short description of what changed and why
- Ensure `npx tsc --noEmit` passes with no errors
- Test the feature manually in the browser before submitting
