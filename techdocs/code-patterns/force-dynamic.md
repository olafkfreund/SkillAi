# force-dynamic on public routes

_Why two routes are pinned to force-dynamic, what bug it works around, and the rule for adding new App Router routes._

`next build` fails on Next 16.2 + React 19 with `Cannot read properties of null (reading 'useContext')` whenever the build tries to statically prerender a route whose layout transitively renders a client component that reads React context at module scope. The `<ThemeProvider>` from `next-themes` in the root layout is the trigger in this codebase — React's context machinery is null during static prerender, so the `useContext` call inside `next-themes` throws.

The workaround is one line per affected route:

```ts
export const dynamic = 'force-dynamic'
```

This skips static prerender entirely and the build stays green.

## Where it's applied

Two routes in the tree currently carry the directive:

- [`src/app/page.tsx`](https://github.com/olafkfreund/SkillAi/blob/core-mvp-foundation/src/app/page.tsx) — the home page, which only redirects to `/dashboard`. Zero cost; nothing visible to cache.
- [`src/app/(dashboard)/layout.tsx`](https://github.com/olafkfreund/SkillAi/blob/core-mvp-foundation/src/app/(dashboard)/layout.tsx) — the dashboard layout. Session-gated anyway, so static caching would never apply to real traffic.

Both files carry a multi-line "DO NOT REMOVE" banner above the export so the directive isn't innocently deleted by a future contributor. PR [#171](https://github.com/olafkfreund/SkillAi/pull/171) strengthened that banner specifically because the failure mode is silent in dev and only surfaces during a production build.

## Rule for new routes

When you add a public route under `src/app/`, default to `force-dynamic`:

```ts
// src/app/(marketing)/about/page.tsx
export const dynamic = 'force-dynamic'

export default function AboutPage() {
  // …
}
```

The only routes that are safe to omit it on are `[param]`-style **dynamic segments without static params** — those don't get prerendered, so they don't hit the bug. Static collected routes (anything that could be selected for prerender) need the directive.

## Why not fix the root cause?

The fix lives upstream in either Next.js or React, not in this repo. Tracked in issue [#41](https://github.com/olafkfreund/SkillAi/issues/41) as "closed by workaround" — the issue stays open as the canonical reference until an upstream patch lands. Until then:

> **⚠️ Caution**
>
> If you're tempted to remove `force-dynamic` from `page.tsx` or `(dashboard)/layout.tsx`, run `next build` first. The error surfaces immediately and the message is the one quoted above. Re-read [#41](https://github.com/olafkfreund/SkillAi/issues/41) before removing the directive.
