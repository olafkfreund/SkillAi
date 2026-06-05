# DEC-004 — Claude as primary AI, Gemini as secondary

_Claude's structured-output reliability and reasoning quality make it the default scoring model; Gemini is retained as a per-tenant toggle for cost-sensitive bulk processing._

> **ℹ️ Note**
>
> **Status:** Accepted · **Category:** Technical · **Date:** 2026-04-09 · **Stakeholders:** Product Owner, Tech Lead

## Decision

Use Claude (`claude-sonnet-4-6`) as the primary AI for CV parsing and candidate scoring, with Gemini (`gemini-2.0-flash`) available as an alternative per-role toggle.

## Context

Claude's structured output support guarantees valid JSON schema responses, which eliminates defensive parsing code and improves reliability of the scoring pipeline. Claude's reasoning quality for nuanced assessment tasks (experience-level judgment, role-fit) is superior in benchmarks. Gemini is retained as an option for cost-sensitive bulk processing and as a comparison baseline.

## Consequences

**Positive:** Reliable structured scoring, high quality reasoning, explainable scores
**Negative:** Claude API costs can add up on large batches; Gemini option adds integration complexity

## Related

- [DEC-009 — Soft AI signal for day-rate budget](./dec-009-soft-budget-signal.md) — the soft budget signal applies to both Claude and Gemini scoring prompts.
