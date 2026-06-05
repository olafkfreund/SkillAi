# Endpoint reference

_Auto-generated REST endpoint reference for SkillAI. All endpoints require a Bearer API token._

> **ℹ️ Note**
>
> This page is **auto-generated** from the source-of-truth OpenAPI document. To regenerate locally, run `npm run docs:gen:openapi` from `docs-site/`. Last generated: **2026-05-29**.

**35 paths**, **43 operations**. Download the raw spec: [openapi.json](https://olafkfreund.github.io/SkillAi/openapi.json).

All endpoints require an `Authorization: Bearer skl_<env>_<token>` header. See [Authentication](./authentication.md) for details.

## approvals

| Method | Path | Scope | Summary |
|---|---|---|---|
| `GET` | `/api/approvals/{roleId}` | `admin` | Get approvals for a role |
| `POST` | `/api/approvals/{roleId}/{candidateId}/approve` | `admin` | Approve a candidate for a role |
| `POST` | `/api/approvals/{roleId}/{candidateId}/reject` | `admin` | Reject a candidate for a role |
| `POST` | `/api/approvals/{roleId}/approve-all` | `admin` | Approve all remaining pending candidates for a role |
| `POST` | `/api/approvals/{roleId}/send` | `admin` | Send shortlist for hiring manager approval |

## candidates

| Method | Path | Scope | Summary |
|---|---|---|---|
| `PATCH` | `/api/candidates/{candidateId}` | `admin` | Update candidate details |
| `POST` | `/api/candidates/{candidateId}/agency` | `admin` | Assign or remove a candidate agency |
| `POST` | `/api/candidates/{candidateId}/archive` | `admin` | Archive (soft-delete) a candidate |
| `POST` | `/api/candidates/{candidateId}/availability` | `admin` | Update candidate availability status |
| `POST` | `/api/candidates/{candidateId}/cv/reformat` | `admin` | Reformat a candidate CV with AI (Claude Haiku) |
| `POST` | `/api/candidates/{candidateId}/enrichment/confirm` | `admin` | Confirm a verified profile for a candidate |
| `POST` | `/api/candidates/{candidateId}/enrichment/dismiss` | `admin` | Dismiss a suggested profile for a candidate |
| `POST` | `/api/candidates/{candidateId}/enrichment/trigger` | `admin` | Trigger web enrichment for a candidate |
| `GET` | `/api/candidates/{candidateId}/notes` | `admin` | Get notes for a candidate |
| `POST` | `/api/candidates/{candidateId}/status` | `admin` | Update candidate pipeline status |

## customers

| Method | Path | Scope | Summary |
|---|---|---|---|
| `DELETE` | `/api/customers/{customerId}/framework` | `admin` | Delete the hiring framework for a customer |
| `GET` | `/api/customers/{customerId}/framework` | `admin` | Get the hiring framework for a customer |
| `PUT` | `/api/customers/{customerId}/framework` | `admin` | Save or update the hiring framework for a customer |

## notes

| Method | Path | Scope | Summary |
|---|---|---|---|
| `POST` | `/api/notes` | `admin` | Create a note for a candidate |
| `DELETE` | `/api/notes/{noteId}` | `admin` | Delete a note |
| `PATCH` | `/api/notes/{noteId}` | `admin` | Update a note |

## roles

| Method | Path | Scope | Summary |
|---|---|---|---|
| `POST` | `/api/roles` | `admin` | Create a new role |
| `PATCH` | `/api/roles/{roleId}` | `admin` | Update an existing role |
| `POST` | `/api/roles/{roleId}/archive` | `admin` | Archive (soft-delete) a role |
| `GET` | `/api/roles/{roleId}/managers` | `admin` | Get managers assigned to a role |
| `POST` | `/api/roles/{roleId}/managers` | `admin` | Assign managers to a role (replaces existing set) |
| `DELETE` | `/api/roles/{roleId}/managers/{userId}` | `admin` | Remove a manager from a role |
| `POST` | `/api/roles/{roleId}/regenerate-tags` | `admin` | Regenerate AI tags for a role |

## scores

| Method | Path | Scope | Summary |
|---|---|---|---|
| `DELETE` | `/api/scores` | `admin` | Remove a candidate from a role (delete score) |
| `POST` | `/api/scores/rescore` | `admin` | Re-score a candidate against a role |

## settings

| Method | Path | Scope | Summary |
|---|---|---|---|
| `GET` | `/api/settings/api-keys` | `admin` | List which API keys have been configured (names only, no values) |
| `POST` | `/api/settings/api-keys` | `admin` | Save or update an API key |
| `DELETE` | `/api/settings/api-keys/{provider}` | `admin` | Remove a configured API key |
| `GET` | `/api/settings/default-pack-language` | `admin` | Get the default interview pack language |
| `PUT` | `/api/settings/default-pack-language` | `admin` | Set the default interview pack language |
| `GET` | `/api/settings/general` | `admin` | Get general (non-secret) tenant settings |
| `PATCH` | `/api/settings/general` | `admin` | Save a general tenant setting |
| `GET` | `/api/settings/trusted-hosts` | `admin` | Get trusted hostnames list |
| `PUT` | `/api/settings/trusted-hosts` | `admin` | Replace the trusted hostnames list |

## users

| Method | Path | Scope | Summary |
|---|---|---|---|
| `GET` | `/api/users` | `admin` | List all users in the tenant |
| `POST` | `/api/users/{userId}/deactivate` | `admin` | Deactivate a user account |
| `PATCH` | `/api/users/{userId}/role` | `admin` | Update a user role |
| `POST` | `/api/users/invite` | `admin` | Create a user invitation link |
