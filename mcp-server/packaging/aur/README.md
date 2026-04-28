# skillai-mcp-bin (AUR)

PKGBUILD for the prebuilt binary version of skillai-mcp.

## Install

```bash
yay -S skillai-mcp-bin
# or paru, pamac, etc.
```

## Configure

```bash
# In your shell rc or claude-desktop env:
export SKILLAI_URL=https://your-skillai-host
export SKILLAI_TOKEN=skl_...
```

## Maintenance

Run `./scripts/bump.sh X.Y.Z` after each release to update pkgver, refresh sha256sums, regenerate .SRCINFO, and prepare a commit. Then `git push` to the AUR remote.
