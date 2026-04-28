# skillai-mcp

A thin stdio MCP bridge that connects **claude-desktop** to the SkillAi `/api/mcp`
endpoint over HTTPS. claude-desktop spawns this binary as a subprocess and communicates
via JSON-RPC 2.0 over stdin/stdout. The bridge authenticates every request with a
bearer token you generate in the SkillAi web UI.

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
nix profile install github:olafkfreund/SkillAi?dir=mcp-server
```

Then configure claude-desktop (see below).

### Option B — NixOS module (system-wide, recommended)

Add to your flake inputs:

```nix
inputs.skillai-mcp.url = "github:olafkfreund/SkillAi?dir=mcp-server";
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
cd mcp-server
npm install
npm run dev          # tsx watch — recompiles on change
npm run build        # compile to dist/
npm start            # run compiled bridge
```

Or enter the Nix dev shell:

```bash
nix develop ./mcp-server
npm install
npm run dev
```

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
nix build ./mcp-server 2>&1 | grep 'got:'
```

Copy the printed hash and replace `pkgs.lib.fakeHash` in `flake.nix`:

```nix
npmDepsHash = "sha256-AAAA...";
```

---

## Smoke test

```bash
SKILLAI_TOKEN=skl_... bash mcp-server/scripts/smoke.sh
```

Prints `PASS: received N tool(s)` or `FAIL` with details.

---

## License

See the root [`LICENSE`](../LICENSE) file — this package is part of the SkillAi
repository and shares its licence.
