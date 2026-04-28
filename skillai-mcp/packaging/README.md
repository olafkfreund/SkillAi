# Packaging staging area

This directory holds the source-of-truth packaging files for `skillai-mcp` distributions.

## In active use (consumed by the release pipeline)

- **`etc/` and `usr/`** — files bundled into `.deb` / `.rpm` packages built by the release pipeline (`.github/workflows/skillai-mcp-release.yml`) via `nfpm.yaml`. Users download the resulting `.deb`/`.rpm` directly from the GitHub Release page — no external repos involved.

## In active use (consumed in-place)

- **`skillai-mcp/flake.nix`** (one level up) — Nix flake consumed via `github:olafkfreund/SkillAi?dir=skillai-mcp`. No external repo involved.

## Deferred — staged for possible future deployment

The three subdirectories below contain ready-to-deploy packaging files for external package managers (Homebrew, AUR, Scoop). **They are NOT currently maintained.** The operator decided not to create the external repos these formats require, so users on those platforms install via the alternatives listed in `skillai-mcp/README.md` (npm, Nix flake, direct binary download from GitHub Releases, or the `.deb`/`.rpm` files).

If you (or a future maintainer) decide to enable any of these, the staged files are a head-start — but expect placeholder SHA256 sums to need replacing and external-repo creation as documented at the bottom of this file.

| Subdir | Format | External target if enabled |
|---|---|---|
| `homebrew-tap/` | Homebrew formula | `github.com/<owner>/homebrew-tap` |
| `aur/` | Arch User Repository PKGBUILD | `ssh://aur@aur.archlinux.org/skillai-mcp-bin.git` |
| `scoop/` | Scoop bucket manifest | `github.com/<owner>/scoop-bucket` |

## Subdirectories

| Subdir | Format | Target external repo / location |
|---|---|---|
| `homebrew-tap/` | Homebrew formula | `github.com/olafkfreund/homebrew-tap` |
| `aur/` | Arch User Repository PKGBUILD | `ssh://aur@aur.archlinux.org/skillai-mcp-bin.git` |
| `scoop/` | Scoop bucket manifest | `github.com/olafkfreund/scoop-bucket` |
| `etc/`, `usr/` | Files baked into `.deb` / `.rpm` packages | Consumed by `nfpm.yaml` in this repo |

## If you decide to enable an external-repo packager later

The deployment recipes below are reference material — they don't run automatically. Expect to redo them per format.

### Homebrew tap

```bash
# Create the empty repo on GitHub first (UI; name it "homebrew-tap")
git clone git@github.com:olafkfreund/homebrew-tap.git
cd homebrew-tap

# Copy staged files
cp -r ~/Source/GitHub/SkillAi/skillai-mcp/packaging/homebrew-tap/* .
cp -r ~/Source/GitHub/SkillAi/skillai-mcp/packaging/homebrew-tap/.github .

# Replace the four placeholder SHA256 sums in Formula/skillai-mcp.rb with real
# values from the GitHub Release page. The release attaches .sha256 sidecars:
#   skillai-mcp-darwin-x64.sha256
#   skillai-mcp-darwin-arm64.sha256
#   skillai-mcp-linux-x64.sha256
#   skillai-mcp-linux-arm64.sha256
# Each contains a single 64-char hex string.

git add . && git commit -m "Initial release skillai-mcp 0.1.0"
git push -u origin main
```

Users then install with:

```bash
brew tap olafkfreund/tap
brew install skillai-mcp
```

### AUR

Requires an AUR account + SSH key registered at <https://aur.archlinux.org>.

```bash
git clone ssh://aur@aur.archlinux.org/skillai-mcp-bin.git
cd skillai-mcp-bin

# Copy staged files (the AUR repo wants files at the repo root, not in subdirs)
cp ~/Source/GitHub/SkillAi/skillai-mcp/packaging/aur/PKGBUILD .
cp ~/Source/GitHub/SkillAi/skillai-mcp/packaging/aur/.SRCINFO .

# On an Arch box (or in an arch-linux Docker image), regenerate sums:
~/Source/GitHub/SkillAi/skillai-mcp/packaging/aur/scripts/bump.sh 0.1.0

# Verify with namcap (optional)
namcap PKGBUILD

git add PKGBUILD .SRCINFO && git commit -m "Initial release 0.1.0"
git push
```

Users then install with:

```bash
yay -S skillai-mcp-bin     # or paru, pamac, etc.
```

### Scoop bucket

```bash
# Create the empty repo on GitHub first (name it "scoop-bucket")
git clone git@github.com:olafkfreund/scoop-bucket.git
cd scoop-bucket

# Copy staged files
cp -r ~/Source/GitHub/SkillAi/skillai-mcp/packaging/scoop/* .
cp -r ~/Source/GitHub/SkillAi/skillai-mcp/packaging/scoop/.github .

# Replace the placeholder hash in bucket/skillai-mcp.json with the real value
# from skillai-mcp-windows-x64.sha256 in the GitHub Release.

git add . && git commit -m "Initial release skillai-mcp 0.1.0"
git push -u origin main
```

Users then install with:

```powershell
scoop bucket add skillai https://github.com/olafkfreund/scoop-bucket
scoop install skillai/skillai-mcp
```

## Deployment — subsequent releases

For each new `skillai-mcp-vX.Y.Z` tag:

| Format | Update mechanism |
|---|---|
| **Homebrew tap** | `brew bump-formula-pr --tag=skillai-mcp-vX.Y.Z Formula/skillai-mcp.rb` (auto-fills SHA256 sums + opens a PR) |
| **AUR** | `./scripts/bump.sh X.Y.Z` then `git commit && git push` (requires Arch box) |
| **Scoop** | `scoop checkver -u skillai-mcp` then `git commit && git push` (Scoop's auto-bumper handles version + hash) |

The Homebrew tap's CI workflow (`.github/workflows/tests.yml`) runs `brew test` and `brew audit` on every PR. The Scoop bucket's CI runs `Test-Bucket.ps1`. AUR has no CI; rely on `namcap` locally before pushing.

## Why this isn't a one-PR-merges-everything story

The three external package managers each demand their own repo / git host:

- Homebrew taps must be at `https://github.com/<user>/homebrew-tap` — the URL pattern is hard-coded in `brew tap`
- AUR is its own git host (`aur.archlinux.org`)
- Scoop buckets are conventionally at `https://github.com/<user>/scoop-bucket`, accessed via `scoop bucket add`

We can't avoid that fan-out. What we CAN do is keep the source of truth here and use those external repos as deployment targets — that's the pattern this directory implements.
