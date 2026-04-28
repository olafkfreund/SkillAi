---
title: "Trusted hosts and default pack language"
category: "Settings & Admin"
audience: ["admin"]
order: 20
lastUpdated: "2026-04-28"
tags: ["settings", "admin", "auth", "language", "i18n"]
---

# Trusted hosts and default pack language

Two admin-only settings handle environment quirks that would otherwise produce confusing errors. This page explains both.

## Trusted hosts

### What this controls

SkillAI uses Auth.js v5, which validates the `Host` header on every authenticated request to prevent host-header injection attacks. By default Auth.js trusts only the `AUTH_URL` you've configured. Anything else — a hostname people use internally, a fallback IP, a development server — is rejected, and users get an opaque "untrusted host" sign-in error.

The **trusted hosts** list is your override. Any hostname listed here passes the Auth.js trust check. `localhost` and `127.0.0.1` are always trusted as a fallback — you never need to enter them.

### When you actually need to use it

- You access the app on `skillai.internal` and `skillai.corp.example.com`. Add both.
- Developers hit the running container by hostname (`my-laptop.local`). Add it for that environment.
- You've set up a Caddy reverse proxy under a new hostname before updating `AUTH_URL`. Add the new hostname temporarily.

If sign-in works, you don't need to touch this setting.

### Format

- Lowercase hostnames only — the form normalises automatically.
- RFC1123 hostname format. Each label 1–63 characters, alphanumerics and hyphens, dot-separated.
- No URL schemes (`https://...`). Just the hostname.
- No port numbers.
- Maximum 20 hostnames per tenant, 253 characters each.

Invalid entries are rejected with a clear error — you'll see "Invalid hostname: foo bar" rather than the request silently dropping.

### Audit trail

Adding or removing entries writes a `settings.trusted_hosts_updated` audit log entry with the diff (added / removed lists). You can see who added what and when from the audit log view.

## Default pack language

### What this controls

When the AI generates an [interview pack](/dashboard/help/interview-packs) or analyses an [interview transcript](/dashboard/help/interview-transcripts), it needs to know what language to emit values in. The resolution order is a three-tier fallback:

1. **Candidate language** — set on the candidate record. Highest priority.
2. **Tenant default pack language** — this setting. Used when the candidate has no preference.
3. **Hard fallback** — `en` (English). Used when neither the candidate nor the tenant has a preference.

So if your team mostly recruits in Polish, set the tenant default to `pl`. The interview pack for any candidate without an explicit language preference comes out in Polish. A candidate with `language = 'en'` still gets an English pack — candidate preference always wins.

### Supported languages

The supported BCP 47 codes are:

| Code | Language |
|---|---|
| `en` | English |
| `pl` | Polish |
| `de` | German |
| `fr` | French |
| `es` | Spanish |
| `it` | Italian |
| `pt` | Portuguese |
| `nl` | Dutch |
| `cs` | Czech |
| `sv` | Swedish |

Anything outside this list is rejected — the directive that drives the AI is hand-tuned per language (formal register clauses for Polish/German/French/etc.) and adding a new one is a code change, not a config change.

### What gets translated

- Question text, rationale, follow-ups, scoring rubric signals.
- Summary text.
- Markdown body of generated documents.

### What stays in English

- JSON field names in the API.
- Established technical terms (Kubernetes, GraphQL, REST, AWS, Postgres).
- Proper nouns.

That's a deliberate design choice — translating field names breaks the schema, and translating "Kubernetes" to "Kuberneten" produces nonsense.

### Formal register

Polish, German, French, Italian, Spanish, and Portuguese get an explicit "use formal register" clause in the AI directive (Pan/Pani, Sie, vous, Lei, usted). Without it the model drifts to informal pronouns, which is wrong for a hiring context.

## Audit trail

Both settings write to the audit log on change. Trusted hosts logs the diff; default pack language logs previous and current values.

Related: [API keys](/dashboard/help/settings-api-keys), [Interview packs](/dashboard/help/interview-packs).
