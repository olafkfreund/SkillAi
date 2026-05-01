---
title: "Light and dark theme"
category: "Getting Started"
audience: ["all"]
order: 28
lastUpdated: "2026-05-01"
tags: ["theme", "light-mode", "dark-mode", "ui"]
---

# Light and dark theme

SkillAi has full light and dark mode coverage across every page, panel, modal, and PDF preview. The default is **system** — SkillAi follows whatever your OS / browser is set to (light during the day, dark at night, if you have macOS / Windows / Android set to auto).

## How to change theme

Look at the sidebar (or sidebar drawer on mobile). Just above the sign-out button you'll see three options:

- **System** (default) — follow OS preference. Switches automatically when your OS does.
- **Light** — force light mode regardless of OS.
- **Dark** — force dark mode regardless of OS.

The choice is per-browser (stored in `localStorage`), not per-tenant or per-user. If you sign in on a different device, that device's setting applies.

## What changes

- All page surfaces (sidebar, dashboard cards, role / candidate detail panels, forms, modals).
- Status pills (e.g. `pending` / `accepted` / `rejected`) — both modes get readable contrast.
- Borders and dividers.
- Form inputs.
- The login page.

## What stays constant across modes

- **Saturated accent colours** (the blue Submit buttons, the red Delete buttons, etc.) are theme-invariant. They're solid action colours and need to read the same in both modes.
- **AI-generated PDFs** (candidate, role, shortlist, interview pack, welcome letter) are always rendered in light mode. PDFs are designed to be printed and shared; dark-mode PDFs would be a usability disaster.
- **Charts and reports** use a single neutral palette that works in both modes.

## Accessibility

Both modes are tested against WCAG AA contrast standards. If you find a panel that's hard to read, that's a bug — open an issue with a screenshot and what mode you're in.

## When to use which

- **System** is the right answer for almost everyone. Your OS is already calibrated to your environment.
- **Light** is good for screen-shares (especially in well-lit rooms / projector environments) where dark mode tends to "burn" through.
- **Dark** is easier on the eyes for long reading sessions (reviewing a stack of CVs late at night).

## Why "system" is the default

Browsers honour the OS-level preference automatically (`prefers-color-scheme`), so SkillAi just follows along. This means:
- New users immediately get the right theme without configuring anything.
- A user with auto-switching OS gets auto-switching SkillAi.
- A user who's set their OS once and forgotten gets the theme they've already decided is right.

## Troubleshooting

- **Theme flicker on page load.** Should be near-zero — SkillAi sets the theme before the first paint to avoid the "white flash on dark mode" anti-pattern. If you see flicker, hard-reload (Cmd-Shift-R / Ctrl-Shift-R) to clear cached HTML.
- **Switched to Light but page header is still dark.** Some browser extensions inject their own dark-mode CSS. Disable the extension on the SkillAi domain.
- **Theme persisted across sign-out / sign-in:** intentional. The setting is browser-local, not tied to your account.

## Related

- Mobile + PWA install: see "Using SkillAi on your phone".
