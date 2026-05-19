# skillai-mcp

A thin stdio MCP bridge that connects **claude-desktop** to the SkillAi `/api/mcp`
endpoint over HTTPS. claude-desktop spawns this binary as a subprocess and communicates
via JSON-RPC 2.0 over stdin/stdout. The bridge authenticates every request with a
bearer token you generate in the SkillAi web UI.

---

## Install

The recommended install paths — none require external package-manager repos:

| Method | OS / distro | Notes |
|---|---|---|
| **Standalone binary from GitHub Releases** | Linux / macOS / Windows | No runtime deps; works everywhere |
| **`.deb` from GitHub Releases** | Debian / Ubuntu | Includes `/etc/skillai-mcp/env.example` |
| **`.rpm` from GitHub Releases** | Fedora / RHEL / openSUSE | Same as above |
| **Nix flake** | NixOS | `nix profile install github:olafkfreund/SkillAi?dir=skillai-mcp` |
| **npm** *(optional — only if `NPM_TOKEN` is configured)* | Anywhere with Node 22+ | `npm install -g skillai-mcp` |

> **Note on npm:** the release pipeline can publish to npmjs.com, but only if the operator has set up an npm scope and added an `NPM_TOKEN` repo secret. If you see no `skillai-mcp` package on npm, that step is intentionally inactive — use one of the binary or Nix paths instead.

> **Note on Homebrew / AUR / Scoop:** packaging files for these are staged at `skillai-mcp/packaging/` for possible future deployment, but no external repos exist for them at this time. Install via the binary or Nix paths.

### Standalone binary (no Node required)

Download the binary for your platform from the
[latest GitHub Release](https://github.com/olafkfreund/SkillAi/releases?q=skillai-mcp-v&expanded=true),
then make it executable:

**Linux x64**
```bash
curl -fsSL https://github.com/olafkfreund/SkillAi/releases/latest/download/skillai-mcp-linux-x64 \
     -o ~/.local/bin/skillai-mcp
chmod +x ~/.local/bin/skillai-mcp
```

**Linux arm64**
```bash
curl -fsSL https://github.com/olafkfreund/SkillAi/releases/latest/download/skillai-mcp-linux-arm64 \
     -o ~/.local/bin/skillai-mcp
chmod +x ~/.local/bin/skillai-mcp
```

**macOS x64**
```bash
curl -fsSL https://github.com/olafkfreund/SkillAi/releases/latest/download/skillai-mcp-darwin-x64 \
     -o /usr/local/bin/skillai-mcp
chmod +x /usr/local/bin/skillai-mcp
```

**macOS arm64 (Apple Silicon)**
```bash
curl -fsSL https://github.com/olafkfreund/SkillAi/releases/latest/download/skillai-mcp-darwin-arm64 \
     -o /usr/local/bin/skillai-mcp
chmod +x /usr/local/bin/skillai-mcp
```

**Windows x64**
```powershell
curl -fsSL https://github.com/olafkfreund/SkillAi/releases/latest/download/skillai-mcp-windows-x64.exe `
     -o "$env:LOCALAPPDATA\Programs\skillai-mcp.exe"
```

Each binary ships with a `.sha256` sidecar file for integrity verification.

### Linux .deb package (Debian / Ubuntu)

```bash
# Replace VERSION with the release version, e.g. 1.0.0
VERSION=1.0.0
wget https://github.com/olafkfreund/SkillAi/releases/download/skillai-mcp-v${VERSION}/skillai-mcp_${VERSION}_amd64.deb
sudo dpkg -i skillai-mcp_${VERSION}_amd64.deb
# or: sudo apt install ./skillai-mcp_${VERSION}_amd64.deb
```

arm64:
```bash
wget https://github.com/olafkfreund/SkillAi/releases/download/skillai-mcp-v${VERSION}/skillai-mcp_${VERSION}_arm64.deb
sudo dpkg -i skillai-mcp_${VERSION}_arm64.deb
```

### Linux .rpm package (RHEL / Fedora / openSUSE)

```bash
VERSION=1.0.0
sudo rpm -i https://github.com/olafkfreund/SkillAi/releases/download/skillai-mcp-v${VERSION}/skillai-mcp_${VERSION}_amd64.rpm
# or with dnf:
sudo dnf install https://github.com/olafkfreund/SkillAi/releases/download/skillai-mcp-v${VERSION}/skillai-mcp_${VERSION}_amd64.rpm
```

### NixOS

See the [NixOS install section](#install-on-nixos) below.

---

## Releases

Releases are tagged `skillai-mcp-vX.Y.Z` and published automatically by the
`.github/workflows/skillai-mcp-release.yml` workflow when that tag is pushed.

Each release includes:
- 5 standalone binaries (linux-x64, linux-arm64, darwin-x64, darwin-arm64, windows-x64)
- SHA256 checksums for each binary
- .deb and .rpm packages for linux-x64 and linux-arm64
- The `skillai-mcp` npm package is published with provenance attestation

To view all releases: <https://github.com/olafkfreund/SkillAi/releases?q=skillai-mcp-v&expanded=true>

---

## Architecture

```
claude-desktop
    │  JSON-RPC 2.0 frames
    │  (NDJSON over stdin/stdout)
    ▼
skillai-mcp  (this binary)
    │  POST /api/mcp
    │  Authorization: Bearer skl_...
    │  Content-Type: application/json
    ▼
SkillAi server  (http(s)://your-host/api/mcp)
```

Logs go to **stderr** only — stdout is reserved for the MCP protocol.

---

## Install on NixOS

### Option A — nix profile (per-user, no module)

```bash
nix profile install github:olafkfreund/SkillAi?dir=skillai-mcp
```

Then configure claude-desktop (see below).

### Option B — NixOS module (system-wide, recommended)

Add to your flake inputs:

```nix
inputs.skillai-mcp.url = "github:olafkfreund/SkillAi?dir=skillai-mcp";
```

In your system configuration:

```nix
{ inputs, ... }:
{
  imports = [ inputs.skillai-mcp.nixosModules.skillai-mcp ];

  # The overlay is injected automatically by the module.
  # If you want pkgs.skillai-mcp available elsewhere, also add:
  # nixpkgs.overlays = [ inputs.skillai-mcp.overlays.default ];

  programs.skillai-mcp = {
    enable = true;
    url = "https://skillai.internal.example.com";  # or http://localhost:3000
    tokenFile = config.age.secrets."skillai-token".path;
    # tokenFile can be any readable file: "/home/alice/.config/skillai/token"
  };
}
```

**Secret management (agenix example):**

```nix
age.secrets."skillai-token" = {
  file = ../secrets/skillai-token.age;
  mode = "0440";
  owner = "alice";  # the user running claude-desktop
};
```

---

## claude-desktop configuration

Edit `~/.config/claude/claude_desktop_config.json` (Linux) or
`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "skillai": {
      "command": "skillai-mcp",
      "env": {
        "SKILLAI_URL": "http://localhost:3000",
        "SKILLAI_TOKEN": "skl_your_token_here"
      }
    }
  }
}
```

If using the NixOS module with `tokenFile`, the wrapper script reads the token at
launch and you can omit `SKILLAI_TOKEN` from the env block (the wrapper sets it).
You can still set `SKILLAI_URL` here to override the module default.

## Claude Code configuration

Claude Code supports SkillAi via either the HTTP transport (no bridge — talks
directly to `/api/mcp`) or the stdio bridge (this binary). HTTP is the simpler
default; pick stdio if you specifically want this binary in the path.

The fastest setup uses the `claude` CLI:

```bash
# HTTP transport (no bridge install required)
claude mcp add --transport http --scope user skillai \
  http://localhost:3000/api/mcp \
  --header "Authorization: Bearer skl_your_token_here"

# Stdio transport (uses this binary)
claude mcp add --transport stdio --scope user skillai skillai-mcp \
  -e SKILLAI_URL=http://localhost:3000 \
  -e SKILLAI_TOKEN=skl_your_token_here
```

Verify with `claude mcp list`. See the in-app help article
*"Connecting SkillAi to Claude Code (MCP server)"* for the project `.mcp.json`
pattern, env-var substitution, and troubleshooting.

---

## Token generation

1. Open the SkillAi web UI.
2. Navigate to **Settings → API Tokens**.
3. Click **Generate new token**.
4. Copy the `skl_...` token — it is shown only once.
5. Store it in your secret manager or the file referenced by `tokenFile`.

---

## Development

```bash
cd skillai-mcp
npm install
npm run dev          # tsx watch — recompiles on change
npm run build        # compile to dist/
npm start            # run compiled bridge
```

Or enter the Nix dev shell:

```bash
nix develop ./skillai-mcp
npm install
npm run dev
```

### Build a local standalone binary (Bun)

[Bun](https://bun.sh) compiles the bridge to a single self-contained binary
with no Node or Bun runtime required on the target machine:

```bash
cd skillai-mcp
bun install --frozen-lockfile

# Linux x64 (run on any linux-x64 machine):
bun build src/index.ts --compile --target=bun-linux-x64 --outfile=dist/skillai-mcp-linux-x64

# macOS Apple Silicon:
bun build src/index.ts --compile --target=bun-darwin-arm64 --outfile=dist/skillai-mcp-darwin-arm64

# Windows x64 (cross-compile from Linux/macOS):
bun build src/index.ts --compile --target=bun-windows-x64 --outfile=dist/skillai-mcp-windows-x64.exe
```

The CI release workflow runs these cross-compilation commands on Ubuntu and
uploads the results to the GitHub Release.

### Manual JSON-RPC test

```bash
export SKILLAI_TOKEN=skl_your_token
export SKILLAI_URL=http://localhost:3000

echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  | node dist/index.js
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `SKILLAI_TOKEN environment variable is required` | Token not set | Set `SKILLAI_TOKEN` env var or check `tokenFile` path |
| JSON-RPC error code `-32001` | 401/403 from server | Token invalid or expired — regenerate at `/settings/api-tokens` |
| JSON-RPC error code `-32002` | 429 from server | Too many requests — wait and retry or check per-tenant rate limits |
| JSON-RPC error code `-32603` + `ECONNREFUSED` | Server not reachable | Check `SKILLAI_URL` and that the SkillAi server is running |
| No output from bridge | Parsing error | Check stderr for `[skillai-mcp]` messages |

---

## Updating the Nix `npmDepsHash`

After cloning or after any `package-lock.json` change, if the Nix build fails with a
hash mismatch, run:

```bash
nix build ./skillai-mcp 2>&1 | grep 'got:'
```

Copy the printed hash and replace `pkgs.lib.fakeHash` in `flake.nix`:

```nix
npmDepsHash = "sha256-AAAA...";
```

---

## Smoke test

```bash
SKILLAI_TOKEN=skl_... bash skillai-mcp/scripts/smoke.sh
```

Prints `PASS: received N tool(s)` or `FAIL` with details.

---

## License

See the root [`LICENSE`](../LICENSE) file — this package is part of the SkillAi
repository and shares its licence.
