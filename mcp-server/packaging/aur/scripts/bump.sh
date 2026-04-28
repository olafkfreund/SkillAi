#!/usr/bin/env bash
# bump.sh — update PKGBUILD + .SRCINFO for a new skillai-mcp-bin release.
# Usage: ./scripts/bump.sh <version>
# Run this script from the root of the AUR git clone (where PKGBUILD lives).
set -euo pipefail

[ "$#" -eq 1 ] || { echo "usage: $0 <version>"; exit 1; }

VERSION="$1"
PKGBUILD="$(cd "$(dirname "$0")/.." && pwd)/PKGBUILD"

if [ ! -f "$PKGBUILD" ]; then
  echo "error: PKGBUILD not found at $PKGBUILD"
  exit 1
fi

echo "==> Bumping to version $VERSION"

# 1. Update pkgver and reset pkgrel
sed -i "s/^pkgver=.*/pkgver=$VERSION/" "$PKGBUILD"
sed -i "s/^pkgrel=.*/pkgrel=1/" "$PKGBUILD"

# 2. Compute sha256 for each architecture artefact
BASE_URL="https://github.com/olafkfreund/SkillAi/releases/download/mcp-bridge-v${VERSION}"

compute_sha256() {
  local url="$1"
  local tmpfile
  tmpfile="$(mktemp)"
  echo "    Downloading $url ..."
  curl -fsSL "$url" -o "$tmpfile"
  sha256sum "$tmpfile" | awk '{print $1}'
  rm -f "$tmpfile"
}

echo "==> Computing sha256sums ..."
SHA_X64="$(compute_sha256 "${BASE_URL}/skillai-mcp-linux-x64")"
SHA_ARM64="$(compute_sha256 "${BASE_URL}/skillai-mcp-linux-arm64")"
echo "    x86_64  : $SHA_X64"
echo "    aarch64 : $SHA_ARM64"

# 3. Replace SKIP placeholders (or previous sums) in PKGBUILD.
#    The sed pattern matches the entire sha256sums_<arch>=('...') line.
sed -i "s/^sha256sums_x86_64=(.*/sha256sums_x86_64=('$SHA_X64')/" "$PKGBUILD"
sed -i "s/^sha256sums_aarch64=(.*/sha256sums_aarch64=('$SHA_ARM64')/" "$PKGBUILD"

# 4. Regenerate .SRCINFO
SRCINFO="$(dirname "$PKGBUILD")/.SRCINFO"
echo "==> Regenerating .SRCINFO ..."
(cd "$(dirname "$PKGBUILD")" && makepkg --printsrcinfo > .SRCINFO)
echo "    Written to $SRCINFO"

# 5. Stage both files
echo "==> Staging changes ..."
git -C "$(dirname "$PKGBUILD")" add PKGBUILD .SRCINFO

echo ""
echo "==> Done. Suggested commit message:"
echo "    Update to $VERSION"
echo ""
echo "Run 'git commit -m \"Update to $VERSION\" && git push' to publish."
