---
title: "API keys: Anthropic, Gemini, Brave, GitHub"
category: "Settings & Admin"
audience: ["admin"]
order: 10
lastUpdated: "2026-04-28"
tags: ["settings", "api-keys", "admin", "anthropic", "gemini"]
---

# API keys: Anthropic, Gemini, Brave, GitHub

SkillAI is a portal in front of several third-party services. None of them work without credentials. This page explains which features each key powers, where to enter it, and how to rotate.

## Where keys live

Settings → API keys (admin only). Five keys are accepted:

| Key | Powers | Get one from |
|---|---|---|
| `anthropic_api_key` | Primary AI: CV scoring, interview pack generation, transcript analysis | console.anthropic.com |
| `google_ai_api_key` | Gemini: alternative scoring engine and embeddings | aistudio.google.com |
| `openai_api_key` | OpenAI embeddings (semantic candidate search) | platform.openai.com |
| `brave_search_api_key` | Candidate enrichment via web search | api.search.brave.com |
| `github_token` | Candidate enrichment via GitHub profile fetch | github.com → Settings → Developer settings |

Only `anthropic_api_key` is genuinely required — without it the app can't score candidates. Everything else degrades gracefully: if there's no Brave key, enrichment skips web search; if there's no GitHub token, profile lookup is skipped; if there's no OpenAI key, semantic search falls back to keyword matching.

## How keys are stored

Every API key is **encrypted at rest** before it touches the database. The encrypt/decrypt cycle uses a server-side key derived from the application's secret — no key value is ever logged, ever returned to the browser in plain form, and ever included in error messages.

What this means in practice:

- After saving a key, the UI shows a "configured" badge but never the value itself. There's no way to read your own key back from the app — if you've forgotten it, you re-enter it.
- The encryption key is part of the application's secret material. **Rotating that secret invalidates every stored API key in every tenant.** Plan for this if you ever change it.

## Per-tenant, not global

Each tenant has its own set of keys. Tenant A's Anthropic credit doesn't pay for tenant B. This is by design — costs are tenant-attributable, and one tenant's quota or rate limit doesn't poison another.

## Who can manage keys

Admin only. The action enforces the role check at the server layer — the form is hidden from non-admins in the UI, and even if a non-admin crafts a request directly the action returns "Only admins can manage API keys."

## Adding a key

Settings → API keys → paste into the relevant field → Save. The key is validated for length (1–500 characters) and immediately encrypted. The next AI call from your tenant will use it.

## Rotating a key

When you rotate a key with the upstream provider:

1. Generate the new key on the provider's console.
2. Paste the new value into Settings → API keys.
3. Save. The old encrypted value is overwritten in place.
4. Revoke the old key on the provider's console.

There's no overlap window in SkillAI itself — the new key replaces the old one immediately on save. If you want zero downtime, save the new key in SkillAI **before** revoking the old one with the provider.

## Removing a key

Click **Remove** next to a configured key. The row is deleted from `tenant_settings`. Features that needed that key will start failing — which is usually what you want when you're decommissioning a service.

## What keys are not

API keys are not user credentials. They're tenant-wide service credentials shared by every recruiter in your tenant. They're also **not** the same as the user invitation tokens you'll see in the user-management area — those are per-user and unencrypted (because they're not secrets, they're one-shot signup links).

Related: [Trusted hosts and default pack language](/dashboard/help/settings-trusted-hosts-and-language), [How AI scoring works](/dashboard/help/ai-how-scoring-works).
