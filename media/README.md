# /media

Marketing artifacts for SkillAi. Generated on 2026-04-14.

## Contents

- `linkedin-post.md` — hook post text, carousel captions, and the reasoning behind the copy choices.
- `screenshots/` — 7 PNGs captured fresh from a running dev instance at 1440×900 @ 2× DPR.

## Before you publish — PII redaction checklist

Screenshots were captured raw against seeded dev data (tenant: ACME). The user names and emails shown are seed fixtures, but **still treat them as PII** — they may look like real people and a public LinkedIn post is forever.

Before uploading, blur or crop in every screenshot:

- [ ] **Candidate names** — Satish Gummadelli, Karthikeyan Manoharan, Varun Maheshwari, Devin Shingadia, Sathish Padmanaban, Srinivas Dupati, David Harland, Benjamin Tsrakasu, Naheem Qureshi, Richard Hall (slides 2, 3, 4, 6)
- [ ] **Email addresses** — `satish.polyglot@gmail.com`, `13.quest@gmail.com`, `devin_shingadia11@hotmail.com` (slides 2, 3, 6)
- [ ] **Client name** — `HSBC` on the role header (slide 2). Decide whether to keep or blur.
- [ ] **Role title** — `DevOps Engineer Jenkins (UK)` is generic enough to leave.
- [ ] **User name (top-left admin card)** — "Alice Admin" is fake, safe to keep.
- [ ] **Day rates** — GBP 600 / 575 / 650 (slides 3, 6). Business-sensitive if anyone recognises the pattern; consider blurring.

Fast redaction: open in Preview / Krita / GIMP → Gaussian blur at 25px radius over each PII element. Or let the LinkedIn draft render each image and blur in Canva / Figma while assembling the PDF carousel.

## Reproducing the screenshots

1. Dev server must be running at `http://localhost:3000` (via `docker compose up`).
2. Seed data loaded: `admin@acme.com` / `admin1234` must be a valid login.
3. Install Playwright in a temp dir:
   ```
   mkdir -p /tmp/pw && cd /tmp/pw && npm init -y && npm install playwright@1.59.1
   ```
4. Copy `scripts/screenshots.ts` as a template — the carousel-specific script lived at `/tmp/pw/capture.mjs` during generation. The important bits:
   - viewport 1440×900, `deviceScaleFactor: 2`
   - `colorScheme: 'dark'`
   - login via `admin@acme.com` / `admin1234`
   - for role-detail slides, scroll the target `h2` into view before snapping (`Candidates (…)`, `AI Hiring Recommendation`)

If the DB is on a different network than the Playwright runner, override with `BASE_URL=http://<host>:3000 node capture.mjs`.

## Posting tips (research-backed, 2026)

- **Post Tue–Thu, 7:00–8:30 local.** B2B SaaS on LinkedIn peaks in that window.
- **Upload the carousel as a PDF**, not as separate images. PDF carousels get ~3× reach and ~2× engagement vs single images.
- **First 150 chars carry the post.** The current hook opener is 87 chars — leaves headroom.
- **Reply to every comment in the first hour.** Early engagement disproportionately controls distribution.
- **3 hashtags max.** More reduces reach.
