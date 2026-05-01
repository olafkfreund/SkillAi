---
title: "Keyboard shortcuts and the Cmd-K command palette"
category: "Getting Started"
audience: ["all"]
order: 3
lastUpdated: "2026-05-01"
tags: ["shortcuts", "keyboard", "power-user", "command-palette", "cmd-k", "search"]
---

# Keyboard shortcuts and the Cmd-K command palette

The single most useful shortcut in SkillAi is **Cmd-K** (macOS) or **Ctrl-K** (Windows / Linux). It opens the global command palette — a search bar over every candidate, role, customer, and agency in your tenant. From anywhere in the app.

## The Cmd-K command palette

### What it does

Press **Cmd-K** (or **Ctrl-K**) anywhere in the dashboard. A search overlay drops down. Type a name, role title, customer name, or agency name. Results appear instantly, grouped by entity type. Press **Enter** on the highlighted row, or click — you're navigated straight to that page.

### What's searchable

- **Candidates** — by first name, last name, email.
- **Roles** — by title, customer-specific role ID, internal role ID.
- **Customers** — by name.
- **Agencies** — by name (including the per-tenant "Internal" agency).

The search is fuzzy — `kim su` will find "Kimberly Sutton". Type at least 2 characters; below that the palette shows the empty state.

Results are RLS-scoped to your tenant. You'll never see another tenant's data, and managers see only candidates / roles they're assigned to via `role_managers`.

### Keyboard nav inside the palette

| Key | Action |
|---|---|
| `↑` / `↓` | Move between results |
| `Enter` | Open the highlighted result |
| `Esc` | Close the palette |
| Click on backdrop | Close the palette |

### Why Cmd-K matters

The browser's back/forward and the sidebar navigation both work, but they're slower than typing. If you're triaging 20 candidates across 5 roles, typing the name and hitting Enter is consistently 2–4× faster than clicking through. The palette becomes muscle memory after a day.

### Speed notes

- The palette query is debounced 200 ms — so a fast typist isn't sending a request per keystroke.
- Results cap at 5 per category to keep the list scannable.
- If you don't see what you expected, type more characters — there's no "load more". The palette is for fast jumps, not exhaustive listing.

## Other keyboard behaviour

The browser's native keyboard works everywhere:

- `Tab` / `Shift+Tab` to move between interactive elements.
- `Enter` / `Space` to activate the focused element.
- `Esc` to close most dialogs.
- `Cmd+F` / `Ctrl+F` to search within the current page (e.g. a long candidate list).

Forms honour the standard pattern: `Enter` submits, `Esc` cancels.

## What's NOT a keyboard shortcut yet

We deliberately haven't added per-page shortcuts (e.g. `J/K` to move between candidates in the ranked list, `S` to change status). The screens are still shifting as the workflow matures, and rebinding everything later is more painful than not having them now.

If you want a specific shortcut, tell your admin. The bar for adding more is "this saves 5+ seconds × 50+ times a day" — point shortcuts at workflows you actually do constantly, not edge cases.

## Mobile

Cmd-K isn't reachable from a phone keyboard. The mobile top app bar has a search icon that opens the same command palette as a tap target. See "Using SkillAi on your phone" for the full mobile rundown.

## See also

- [Welcome to SkillAi](/dashboard/help/welcome)
- [Your first role](/dashboard/help/your-first-role)
- [Using SkillAi on your phone](/dashboard/help/mobile-and-pwa)
