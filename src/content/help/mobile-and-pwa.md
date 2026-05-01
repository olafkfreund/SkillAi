---
title: "Using SkillAi on your phone (mobile + PWA)"
category: "Getting Started"
audience: ["all"]
order: 27
lastUpdated: "2026-05-01"
tags: ["mobile", "pwa", "responsive", "ios", "android"]
---

# Using SkillAi on your phone (mobile + PWA)

Every page in SkillAi works on small screens. The portal is fully responsive from a 320 px-wide viewport upwards, and you can install it as a PWA (Progressive Web App) for a phone-like experience without going through the App Store / Play Store.

## What's responsive

- **Sidebar → drawer.** On phones the sidebar is hidden behind a hamburger menu in the top app bar. Tap to slide it in; tap the backdrop to dismiss.
- **Top app bar.** A compact bar at the top of every dashboard page on mobile shows the page title and your avatar. The Cmd-K search button is also there.
- **Candidate list as cards.** Below the `xs:400` breakpoint the candidate list collapses from table rows to stacked cards — easier to scan with a thumb. Bulk-select still works via the checkbox on each card.
- **Candidate detail reflow.** The two-column layout collapses to one column on phones. The score breakdown and notes stack below the candidate header rather than sitting beside it.
- **Manager mobile Approve / Reject.** Hiring managers reviewing on their phone get a sticky bottom bar with Approve / Reject / Comment so the action stays in reach.
- **Comparison tray repositioning.** When comparing candidates on a phone, the tray docks to the bottom of the screen rather than floating right.
- **Forms + modals.** All form fields and modal dialogs honour the 44 px minimum tap-target size required for iOS / Android accessibility.

## Installing as a PWA

### iOS (Safari)
1. Open SkillAi in Safari (not Chrome on iOS — iOS PWA install is Safari-only).
2. Tap the share icon (the box with an up arrow) at the bottom of the screen.
3. Scroll down → **Add to Home Screen**.
4. Confirm the name and tap Add.
5. SkillAi appears as an app icon. Tapping it opens the portal in a fullscreen window with no Safari chrome.

### Android (Chrome)
1. Open SkillAi in Chrome.
2. Tap the three-dot menu (top right) → **Install app** (or **Add to Home screen**).
3. Confirm the name and tap Install.
4. SkillAi appears in your app drawer + home screen.

### Desktop (Chrome / Edge)
1. Open SkillAi.
2. Look for the install icon in the URL bar (a small monitor with a down arrow).
3. Click → Install.
4. SkillAi opens as a standalone desktop app window.

## What the PWA gives you

- **Home-screen icon** with the SkillAi logo.
- **Standalone window** — no browser address bar, no tab clutter.
- **Offline shell** — if you lose connectivity mid-session, the app shell stays loaded and you'll see a graceful offline indicator instead of a "no internet" browser page.
- **Faster load** — the static shell (CSS, fonts, JS) is cached. First navigation after launch is near-instant.

## What the PWA does NOT give you

- **Offline editing.** SkillAi is data-heavy and tenant-isolated; we do not cache candidate data or scoring runs offline. If you're offline, you can open the app but most pages will say "couldn't load."
- **Push notifications.** Not implemented in v1. Use email notifications (Slack / Teams webhooks for tenant-wide events).
- **Native camera / file system access** beyond what the browser provides. CV upload still goes through the standard file-picker.

## Things to know on a phone

- **The Cmd-K command palette** is reachable from the top app bar's search icon on mobile (no keyboard shortcut).
- **Light / dark theme** follows your system preference by default. Override in the sidebar drawer (sun / moon button above sign-out).
- **Long forms** (creating a role, editing a candidate) are still long. The mobile layout stacks fields cleanly but the form itself is the same — there's no "mobile-only minimal create" flow. If you're doing a lot of creation, prefer desktop.
- **Bulk operations** are designed mobile-friendly. Selecting 5 candidates and bulk-changing status works well on a phone; selecting 50 does not.

## Troubleshooting

- **Install option missing.** PWA install requires HTTPS. If you're hitting SkillAi over plain HTTP (dev environment), iOS Safari and Android Chrome both hide the install option.
- **Logged-out unexpectedly after install.** PWAs share cookies with the source browser. If you cleared Safari cookies after installing, re-open and sign in again.
- **Sidebar drawer doesn't dismiss.** Tap the dark backdrop area outside the drawer, not just the menu button.

## Related

- Light/dark theme: see "Light and dark theme".
- Cmd-K command palette: see "Keyboard shortcuts".
