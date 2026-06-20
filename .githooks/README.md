# Git hooks (`.githooks/`)

Committed, opt-in git hooks for this repo. They are **not** active until you point
git at this directory:

```bash
git config core.hooksPath .githooks
```

Run that once per clone / checkout. CI does not need it (the hooks no-op when `CI`
or `GITHUB_ACTIONS` is set).

## Hooks

| Hook | Purpose |
|---|---|
| `pre-commit` | **Base-branch commit guard** (issue #216). Refuses a commit made directly on `core-mvp-foundation`, the protected base branch. Feature work and background agents must commit on their own branch / worktree. Override a deliberate base commit with `ALLOW_BASE_COMMIT=1 git commit …`. |

See [`docs/agent-worktree-recovery.md`](../docs/agent-worktree-recovery.md) for the
background, the failure modes this prevents, and the recovery procedure when an
agent has already contaminated the main checkout.
