# Vendored HR skills

These markdown files are vendored from <https://github.com/borghei/Claude-Skills> under MIT + Commons Clause licence. They are injected into Claude API calls as cached system blocks per Epic [#190](https://github.com/olafkfreund/SkillAi/issues/190) / issue [#197](https://github.com/olafkfreund/SkillAi/issues/197).

**Upstream commit synced:** `b3f2d35b273bfc9621122c45e034c214ddd06f9e`
**Last sync:** 2026-05-20

## Files

| File | Source | Purpose |
|---|---|---|
| `talent-acquisition.md` | upstream | Sourcing, interviewing, offer-management scorecards |
| `people-analytics.md` | upstream | Attrition / quality-of-hire / pay-equity reasoning |
| `eu-uk-supplement.md` | SkillAi | UK / EU work-authorisation context the upstream skill explicitly omits |

## Why vendor instead of submodule or runtime fetch

- **Determinism.** Every build of SkillAi ships the exact bytes of the skill that were reviewed. No upstream main-branch drift can change AI behaviour between deploys.
- **Air-gap friendliness.** SkillAi is a self-hosted internal tool. Reaching out to GitHub at runtime to fetch a skill is unacceptable for tenants who run without external network access.
- **Auditability.** The licence header at the top of each vendored file pins the upstream commit. `git blame` on the vendored copy answers "when did this content change in our repo?" without needing the submodule history.
- **Edit hygiene.** Vendored files are read-only by convention (header comment + this README). Local modifications go in a sibling supplement file, not into the vendored copy.

## Licence preservation

The upstream `borghei/Claude-Skills` repo is published under MIT + Commons Clause. Both vendored files retain:

1. The original `license: MIT + Commons Clause` field in the YAML front-matter.
2. A header HTML comment (`<!-- Vendored from … -->`) recording upstream URL, commit SHA, sync date, and author attribution.

The SkillAi-authored `eu-uk-supplement.md` is internal SkillAi content (MIT-equivalent licence in its YAML).

## Resync workflow

When upstream changes:

1. Fetch new SKILL.md files via `gh api`:
   ```bash
   gh api repos/borghei/Claude-Skills/contents/hr-operations/talent-acquisition/SKILL.md --jq '.content' | base64 -d > /tmp/talent-acquisition.upstream.md
   gh api repos/borghei/Claude-Skills/contents/hr-operations/people-analytics/SKILL.md --jq '.content' | base64 -d > /tmp/people-analytics.upstream.md
   ```
2. Diff against the current vendored copies (skipping the leading HTML header comment):
   ```bash
   diff <(tail -n +13 src/lib/ai/skills/talent-acquisition.md) /tmp/talent-acquisition.upstream.md
   ```
3. Apply changes manually — **do not auto-overwrite** the file. The HTML header comment at the top must be preserved.
4. Update this README's `Upstream commit synced` SHA + `Last sync` date.
5. Bump `version` in `package.json` if the change is material to scoring or interview behaviour.
6. Run `npm test` to confirm any future `loadHrSkill()` test still passes (the loader is shipped in issue [#196](https://github.com/olafkfreund/SkillAi/issues/196), not this PR).

## What this PR does not include

- **No code.** No loader, no Claude API call wiring, no schema changes, no migrations. Pure markdown-on-disk.
- **No tests.** The loader and its tests land in issue #196.
- **No runtime fetching.** These files are read off disk at build / boot time only — never via network.
