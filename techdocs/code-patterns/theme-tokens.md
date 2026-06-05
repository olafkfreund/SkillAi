# Theme tokens (light & dark)

_The CSS-variable token system in globals.css, the rules for when to use a token vs a direct Tailwind colour, and the status-pill dark-prefix pattern._

SkillAI ships both a dark theme (default) and a light theme via `next-themes`. The colour system is a small set of CSS variables declared in [`src/app/globals.css`](https://github.com/olafkfreund/SkillAi/blob/core-mvp-foundation/src/app/globals.css) and consumed through Tailwind's `bg-[var(--token)]` arbitrary-value syntax. The dark palette lives under `:root`; the light palette lives under `.light` and is activated by toggling that class on `<html>`.

## Surface tokens

These six tokens cover every chrome surface in the app:

| Token | Dark value | Light value | Use for |
|---|---|---|---|
| `--color-bg-app` | `#09090b` zinc-950 | `#f4f4f5` zinc-100 | Page background |
| `--color-bg-elevated` | `#18181b` zinc-900 | `#ffffff` | Cards, panels, sidebar |
| `--color-bg-input` | `#27272a` zinc-800 | `#f9fafb` gray-50 | Form inputs, hover states |
| `--color-fg` | `#f4f4f5` zinc-100 | `#18181b` zinc-900 | Primary text |
| `--color-fg-muted` | `#a1a1aa` zinc-400 | `#52525b` zinc-600 | Secondary text |
| `--color-fg-subtle` | `#71717a` zinc-500 | `#6b7280` gray-500 | Tertiary text, captions |
| `--color-border` | `#3f3f46` zinc-700 | `#d1d5db` gray-300 | All borders |

Every pair has been measured for WCAG AA contrast in both modes — the comments alongside each token in `globals.css` show the measured ratio.

```tsx
<div className="bg-[var(--color-bg-elevated)] border border-[var(--color-border)] text-[var(--color-fg)]">
  <h2 className="text-[var(--color-fg)]">Title</h2>
  <p className="text-[var(--color-fg-muted)]">Body copy</p>
  <small className="text-[var(--color-fg-subtle)]">Timestamp</small>
</div>
```

## Saturated accents stay as direct Tailwind

Solid action buttons and brand-coloured pills (`bg-blue-600`, `bg-emerald-700`, `bg-violet-600`, `bg-amber-500`, `bg-red-600`) are theme-invariant — they read correctly on both light and dark surfaces without re-tinting. Leave these as plain Tailwind utilities; do not convert them to tokens. The token system is for surfaces and text, not accent colour.

## Status pills — the `dark:` prefix pattern

Status pills (Scoring, Submitted, INTERNAL, score buckets) carry their own per-status colour pair and need to read in both themes. The convention is `bg-X-100 dark:bg-X-950 text-X-700 dark:text-X-300 border-X-300 dark:border-X-800`. Pale tint + saturated text in light mode flips to dark tint + lighter text in dark mode, and contrast holds either way.

```tsx
<span className="inline-flex items-center gap-1 text-xs border rounded-full px-2 py-0.5
                 bg-emerald-100 dark:bg-emerald-950
                 text-emerald-700 dark:text-emerald-300
                 border-emerald-300 dark:border-emerald-800">
  Submitted
</span>
```

The six pipeline statuses (new / shortlisted / interviewing / offered / hired / rejected) additionally have dedicated tokens (`--color-status-{state}-bg`, `--color-status-{state}-fg`) so the candidate-list status badge can use a single class lookup — see `STATUS_BADGE` in [`selectable-candidate-list.tsx:43`](https://github.com/olafkfreund/SkillAi/blob/core-mvp-foundation/src/components/candidates/selectable-candidate-list.tsx#L43).

> **⚠️ Caution**
>
> Never reintroduce hardcoded `bg-zinc-{700,800,900,950}`, `text-zinc-{100,300,400,500,600}`, or `border-zinc-{600,700,800}` for surfaces. Those classes were the v1 dark-only palette and don't flip under `.light`. The full migration was Epic [#103](https://github.com/olafkfreund/SkillAi/issues/103), shipped across PRs [#161](https://github.com/olafkfreund/SkillAi/pull/161)–[#165](https://github.com/olafkfreund/SkillAi/pull/165). See [DEC-001](../decisions/dec-001-build-vs-buy.md) for the broader self-hosted, theme-controlled product stance.
