# In-app help content

_How the /dashboard/help articles are authored as flat markdown files, validated by Zod at load time, and filtered by user role._

The in-app help hub at `/dashboard/help` is a flat-file system: every article is a `.md` file in `src/content/help/` with YAML front-matter. Authoring a new article means dropping a file in that directory — no code change, no migration, no rebuild step beyond the next deploy. The loader is [`src/lib/help/loader.ts`](https://github.com/olafkfreund/SkillAi/blob/core-mvp-foundation/src/lib/help/loader.ts) and is marked `'server-only'` so it never leaks into a client bundle.

## Front-matter shape

Every article declares these fields. The schema is enforced by Zod at load time so a malformed file fails loudly with a console warning and is skipped — it never reaches the UI:

```yaml
---
title: "GDPR right-to-erasure (deleting a candidate)"
category: "Settings & Admin"
audience: ["admin"]
order: 55
lastUpdated: "2026-04-28"
tags: ["gdpr", "privacy", "compliance"]
---
```

| Field | Type | Notes |
|---|---|---|
| `title` | string | Required, non-empty |
| `category` | enum | One of the 8 fixed categories below |
| `audience` | string[] | Defaults to `['all']` |
| `order` | number | Sort key, defaults to `100` |
| `lastUpdated` | `YYYY-MM-DD` | Validated by regex |
| `tags` | string[] | Free-form, defaults to `[]` |

The 8 categories are fixed in code (`CATEGORIES` const): Getting Started, Roles & Candidates, AI Scoring & Interviews, Hiring Manager Workflow, Agencies & Customers, Settings & Admin, Tips & Best Practice, Troubleshooting. Adding a new category is a one-line code change.

## Audience filter

`audience` accepts `'all' | 'admin' | 'recruiter' | 'hiring_manager' | 'viewer'`. The loader's public API takes the current user's `UserRole` and filters before returning:

```ts
function isVisibleTo(article: HelpArticle, role: UserRole): boolean {
  return article.audience.includes('all') || (article.audience as string[]).includes(role)
}
```

So a hiring manager browsing `/dashboard/help` sees only `audience: ["all"]` and `audience: ["hiring_manager"]` articles — recruiter-only operational guides simply aren't in their navigation tree.

## Validation failure mode

`parseFile` wraps the whole parse in `try/catch`. If `matter()` chokes on bad YAML, or Zod rejects the parsed object (missing `title`, wrong category, malformed date), the failure logs a warning and returns `null`. The article is skipped, the loader keeps going, the rest of the help hub renders normally. Failing loud-but-isolated is deliberate: one broken article doesn't take down the whole page, but the warning ensures the breakage isn't silent.

```ts
} catch (err) {
  console.warn(`[help/loader] Skipping ${filePath}: ${(err as Error).message}`)
  return null
}
```

## Module-scope cache

Articles are read from disk once per Node.js process and cached in a module-scope `Map`. Files don't change at runtime in production, so the filesystem cost is paid once on the first request and never again. In dev, restart the server to pick up new articles.

## Adding an article

1. Create `src/content/help/your-slug.md`
2. Add the front-matter block above (pick the right category and audience)
3. Write markdown body
4. Done — it appears in `/dashboard/help` after the next request

No registration step, no index update.

> **ℹ️ Note**
>
> This is **distinct** from the docs site you're reading now. In-app help is recruiter-facing operational quick-reference loaded inside the SkillAI app and gated by the logged-in user's role. This docs site is the engineering and integration reference — public, no auth, MDX with Starlight components, deployed separately. Don't mix concerns: a new "how does the manager approval flow work" article belongs in `src/content/help/`; a new "how does the audience-sanitisation pattern work" page belongs here under `code-patterns/`.
