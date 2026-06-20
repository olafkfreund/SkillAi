# Agent worktree recovery & isolation runbook

> Recovering from — and preventing — background-agent contamination of the main
> checkout. Tracking issue: [#216](https://github.com/olafkfreund/SkillAi/issues/216).

## What goes wrong

Background agents are supposed to operate in an isolated git worktree
(`.claude/worktrees/agent-<id>/`). In practice an agent's shell `cwd` can default
to the **main checkout** (`/home/olafkfreund/Source/GitHub/SkillAi`), so any
`git checkout`, `npm`, or `docker` command without an explicit `cd` lands in the
shared checkout instead of the worktree. This has caused repeated dev-portal
outages:

- An in-progress (non-`async`) export left in `settings.ts` — Next.js `'use server'`
  rejects it and the portal breaks until hand-fixed.
- Multiple agents writing rapidly into the main checkout corrupt the
  bind-mounted `.next/dev/` cache.
- An agent running `npm run build` inside the main checkout leaves a **root-owned**
  stale `.next/` (container UID writes vs host UID), after which Next.js dev throws
  `ENOENT` for `build-manifest.json` on every request.

## Symptoms

- `git branch --show-current` in the main checkout shows a `feat/…` branch instead
  of `core-mvp-foundation`.
- Untracked / modified files in `git status` that match an in-flight agent's scope.
- The dev portal returns `ENOENT` manifest errors after a flurry of file changes.
- `.next/dev/` contains root-owned files.

## Recovery procedure

Run these in the **main checkout** (`/home/olafkfreund/Source/GitHub/SkillAi`).

1. **Confirm the damage.**

   ```bash
   git -C /home/olafkfreund/Source/GitHub/SkillAi status
   git -C /home/olafkfreund/Source/GitHub/SkillAi branch --show-current
   ```

2. **Rescue anything you want to keep.** If the stray changes are real work,
   move them to a branch before resetting:

   ```bash
   git -C /home/olafkfreund/Source/GitHub/SkillAi switch -c rescue/agent-stray-$(date +%s)
   git -C /home/olafkfreund/Source/GitHub/SkillAi add -A && git commit -m "rescue: stray agent changes"
   ```

   Otherwise skip to step 3 to discard them.

3. **Reset the main checkout to the clean base.**

   ```bash
   git -C /home/olafkfreund/Source/GitHub/SkillAi fetch origin
   git -C /home/olafkfreund/Source/GitHub/SkillAi switch core-mvp-foundation
   git -C /home/olafkfreund/Source/GitHub/SkillAi reset --hard origin/core-mvp-foundation
   git -C /home/olafkfreund/Source/GitHub/SkillAi clean -fd   # removes untracked files — review first
   ```

4. **Fix root-owned `.next` ownership** (only if the cache went root-owned). From
   the host:

   ```bash
   sudo chown -R "$(id -u):$(id -g)" /home/olafkfreund/Source/GitHub/SkillAi/.next
   # or just remove it; Next rebuilds on next start
   rm -rf /home/olafkfreund/Source/GitHub/SkillAi/.next
   ```

5. **Restart the dev container** to clear the in-memory build manifest:

   ```bash
   docker compose restart app
   ```

6. **Verify recovery.** The portal should serve again; `git status` should be clean
   on `core-mvp-foundation`.

## How to avoid this

- **Always run agents with worktree isolation** (`isolation: "worktree"`), and have
  each agent **`cd` into its worktree first** — never run `git` / `npm` / `docker`
  from the main checkout.
- **Branch from `origin/core-mvp-foundation` explicitly** inside the worktree so the
  base is correct regardless of where the shell started.
- **Never run a dev server or `docker` from a worktree** — build / typecheck only.
  The dev server belongs to the main checkout alone.
- **Enable the base-branch commit guard** so an accidental commit on the protected
  branch is rejected before it lands:

  ```bash
  git config core.hooksPath .githooks
  ```

  See [`.githooks/README.md`](../.githooks/README.md). Override a deliberate base
  commit with `ALLOW_BASE_COMMIT=1 git commit …`.
