# DEC-006 — Auth.js v5 over Clerk for authentication

_Clerk would have shipped faster but routes sessions through external SaaS. Auth.js v5 with credentials + JWT keeps all auth data on-premise, satisfying our data-sovereignty rule._

> **ℹ️ Note**
>
> **Status:** Accepted · **Category:** Technical · **Date:** 2026-04-09 · **Stakeholders:** Tech Lead, Product Owner

## Decision

Use Auth.js v5 (NextAuth) with credentials provider and JWT sessions instead of Clerk.

## Context

Research flagged Clerk as the fastest-setup auth solution for Next.js with built-in RBAC. However, Clerk is a SaaS service — user sessions and auth events are processed on Clerk's infrastructure. Since SkillAI handles sensitive candidate PII and is explicitly an internal tool, all auth must remain self-hosted with no data leaving company infrastructure. Auth.js v5 is self-hosted, credentials-based, and fully on-premise.

The additional setup cost (implementing RBAC manually vs Clerk's built-in) is acceptable: we need only 3 roles (admin, recruiter, viewer), which maps to a simple JWT claim + middleware check — approximately 2-4 hours of work.

## Alternatives Considered

1. **Clerk**
   - Pros: 30-minute setup, RBAC built-in, managed sessions
   - Cons: External SaaS dependency, candidate/user data transits Clerk servers, violates internal-only data policy

2. **Keycloak (self-hosted)**
   - Pros: Enterprise OIDC/SAML, full self-hosted
   - Cons: Requires a separate service, significant ops overhead, overkill for 3 roles and 20-50 users

## Rationale

Data sovereignty is non-negotiable for candidate PII. Auth.js v5 with credentials + JWT + Drizzle adapter is the simplest fully self-hosted solution that integrates natively with our stack.

## Consequences

**Positive:** All auth data stays on-premise, no external SaaS dependency, integrates cleanly with Drizzle adapter
**Negative:** Manual RBAC implementation (~3 hours), manual password reset flow if needed later

## Related

- [DEC-001 — Build vs buy](./dec-001-build-vs-buy.md) — the data-sovereignty principle this decision applies.
- [DEC-007 — Manual transcript upload](./dec-007-manual-transcript-upload.md) — the same data-sovereignty argument rules out third-party transcript aggregators.
- The role enum has since grown to four (`admin`, `recruiter`, `hiring_manager`, `viewer`) — see the roadmap Hiring Manager Persona section.
