---
title: "Calendar OAuth credentials (Google + Microsoft)"
category: "Settings & Admin"
audience: ["admin"]
order: 60
lastUpdated: "2026-04-28"
tags: ["oauth", "google calendar", "microsoft", "integration", "setup"]
---

# Calendar OAuth credentials (Google + Microsoft)

SkillAI connects to a recruiter's Google or Outlook calendar so that interview slots created in the app appear on their calendar, and so that external reschedules or cancellations flow back via the calendar sync loop. To do that, the deployment (or each tenant) needs an OAuth `client_id` and `client_secret` registered with Google Cloud Console or the Azure Portal. This page explains how to obtain them, where to enter them, and how to fix the redirect URI errors you will hit on the way.

## Where you set the credentials

Two paths, both supported, with the same effect at runtime:

- **In-app settings (recommended)** — admin-only `/settings` page, "Calendar OAuth credentials" card. Per-tenant. Encrypted at rest with the same `ENCRYPTION_KEY` that protects API keys.
- **Environment variables (deployment-level fallback)** — set in `.env.local` or your container's environment. A single set of credentials is shared across every tenant on the deployment. Convenient for self-hosted single-tenant installs.

Resolution order on each OAuth init request:

1. Tenant settings (if PR B has shipped and the admin has saved values)
2. Environment variable fallback
3. If both are missing, the OAuth flow returns `503 OAuth not configured` and the **Connect** button errors out.

The env-var fallback is a real feature, not a workaround — for self-hosted single-tenant deployments it removes a step.

## Setting up Google Calendar OAuth

The Google Cloud Console UI changes more than its docs do. Steps below are current as of April 2026.

1. Go to https://console.cloud.google.com/apis/credentials and pick or create a project.
2. **APIs & Services → Library** → search "Google Calendar API" → click → **Enable**.
3. **APIs & Services → OAuth consent screen** → set up if not yet configured. User type **External** is fine for internal recruiting use; while the consent screen is in test mode, add yourself and any other recruiters as **Test users**.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**
   - Name: e.g. "SkillAI"
   - Authorised redirect URIs — add this **exact URL** (substitute your deployment's host):

     ```
     https://your-deployment.example.com/api/auth/calendar/google/callback
     ```

   - For local dev:

     ```
     http://localhost:3000/api/auth/calendar/google/callback
     ```

   - For Tailscale-hosted dev (common pattern):

     ```
     http://your-host.tailnet.ts.net:3000/api/auth/calendar/google/callback
     ```

   - Multiple URIs are allowed — register every host you will OAuth from.
5. Click **Create**. Copy the **Client ID** (ends in `.apps.googleusercontent.com`) and **Client Secret**.
6. Paste both into SkillAI (UI or env vars per the section above).

Required scope: `https://www.googleapis.com/auth/calendar.events` (read + write events). The OAuth init route requests it automatically — no manual configuration in Google Cloud is needed.

## Setting up Microsoft / Outlook Calendar OAuth

Steps use https://portal.azure.com terminology current as of April 2026 (Azure Active Directory has been rebranded **Microsoft Entra ID** but the URLs and most labels still reference both).

1. Go to **Microsoft Entra ID → App registrations → New registration**.
2. Name: e.g. "SkillAI".
3. Supported account types: choose based on your audience.
   - For most recruiting tenants: **"Accounts in any organisational directory and personal Microsoft accounts"** (multi-tenant + personal).
   - For single-org installs: **"Accounts in this organisational directory only"** — and note the **Directory (tenant) ID**, you will need it as `MICROSOFT_TENANT_ID`.
4. Redirect URI → platform **Web** → URL:

   ```
   https://your-deployment.example.com/api/auth/calendar/microsoft/callback
   ```

   You can add more redirect URIs after registration; do that for each host you OAuth from.
5. Click **Register**. Copy the **Application (client) ID**.
6. **Certificates & secrets → New client secret** → set expiry (default 6 months; longer if you want fewer rotations) → copy the **Value** (not the Secret ID) immediately. The Value is only shown once.
7. **API permissions → Add a permission → Microsoft Graph → Delegated permissions**:
   - `Calendars.ReadWrite`
   - `offline_access`

   Click **Add permissions**. For an org-wide deployment, click **Grant admin consent for &lt;your tenant&gt;** so individual users do not have to.
8. Paste the Application (client) ID and the client secret Value into SkillAI. If your app is single-tenant, also paste the Directory (tenant) ID — otherwise SkillAI defaults to `common`.

Required scopes: `https://graph.microsoft.com/Calendars.ReadWrite offline_access`. The OAuth init route requests them automatically.

## The redirect URI gotcha

The redirect URI registered in Google Cloud or Azure must **exactly** match the URL SkillAI redirects through, which is built as:

```
${NEXT_PUBLIC_APP_URL}/api/auth/calendar/{google|microsoft}/callback
```

"Exactly" means:

- Same scheme — `http` and `https` are different.
- Same host — `localhost` and `127.0.0.1` are different; a Tailscale hostname and `localhost` are different.
- Same port.
- Same path — case-sensitive, trailing slash matters.

If you access SkillAI from multiple hosts (localhost for dev, Tailscale, production domain), register **each** as a separate redirect URI. Both Google and Microsoft allow multiple.

The most common error you will see is `redirect_uri_mismatch`. That is always this.

## Rotating credentials

When you rotate a client secret with the provider:

1. Generate the new secret in Google Cloud or Azure → the old secret is revoked immediately.
2. Update the new secret in SkillAI (UI or env).
3. Existing connected calendars (rows in `calendar_connections`) keep working — the refresh tokens were issued against the `client_id`, not the secret.

If you rotate the **`client_id`** itself (registering a brand-new OAuth app), all previously connected users must reconnect — the refresh tokens issued under the old `client_id` are no longer valid. Users will see "Calendar disconnected" the next time the sync loop runs.

## Removing credentials

- Removing them via the SkillAI UI clears the `tenant_settings` rows. The env-var fallback (if set) takes over.
- Removing both the env vars and the tenant settings returns SkillAI to the **OAuth not configured** state — the Connect button returns `503`.
- Existing rows in `calendar_connections` are **not** cleared by either action. The records remain, but they cannot refresh tokens, so the connections become inert.

## Troubleshooting

| Error | Likely cause | Fix |
|---|---|---|
| `Google OAuth not configured` (503) | Neither `tenant_settings` nor the env var has the `client_id` | Set credentials per the resolution order above |
| `Microsoft OAuth not configured` (503) | Same as above for Microsoft | Same fix |
| `redirect_uri_mismatch` from Google or Microsoft | URI registered with the OAuth app does not match `${NEXT_PUBLIC_APP_URL}/api/auth/calendar/{provider}/callback` | Add the exact URI to your OAuth app's authorised redirects; check scheme, host, port, path |
| `invalid_client` from Google or Microsoft | `client_secret` typo or rotated upstream | Re-paste the secret. For Microsoft, ensure you copied the secret **Value**, not the Secret ID |
| `access_denied` from the consent screen | User declined, or the OAuth consent screen is in test mode and the user is not on the test users list | Add the user to **Test users**, or publish the OAuth consent screen for production |
| Connection shows as successful but calendar sync returns 0 events | Wrong calendar selected (Google defaults to `primary`), or scope was insufficient at the time of consent | Check the `calendar_connections.calendar_id` row; verify the registered scopes; have the user disconnect and reconnect |

## Environment variables

If you are using the deployment-level fallback rather than the in-app settings, these are the variables SkillAI reads:

```
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
MICROSOFT_CLIENT_ID=<from Azure Portal>
MICROSOFT_CLIENT_SECRET=<from Azure Portal>
MICROSOFT_TENANT_ID=<optional; defaults to "common"; set if your Azure app is single-tenant>
NEXT_PUBLIC_APP_URL=<your deployment URL — used to build the redirect URI>
```

`NEXT_PUBLIC_APP_URL` is the one variable that has to be right even when you are using the in-app settings — it is the value that builds the `redirect_uri` SkillAI sends to the OAuth provider, which is the value that has to match what you registered.

## Related articles

[API keys: Anthropic, Gemini, Brave, GitHub](/dashboard/help/settings-api-keys) — OAuth credentials are stored encrypted with the same `ENCRYPTION_KEY` that protects API keys; rotating that key invalidates both.
