# skillai-mcp

Stdio MCP bridge that connects **claude-desktop** to the SkillAi `/api/mcp`
endpoint over HTTPS.  claude-desktop spawns this binary as a subprocess and
communicates via JSON-RPC 2.0 over stdin/stdout.

Full documentation: <https://github.com/olafkfreund/SkillAi/tree/main/mcp-server>

---

## Quick start (OS package install)

### 1. Obtain an API token

1. Open the SkillAi web UI.
2. Navigate to **Settings → API Tokens**.
3. Click **Generate new token** and copy the `skl_...` value.

### 2. Configure the env file (optional)

```bash
sudo cp /etc/skillai-mcp/env.example /etc/skillai-mcp/env
sudo nano /etc/skillai-mcp/env
# Set SKILLAI_URL and SKILLAI_TOKEN
```

### 3. Configure claude-desktop

Edit `~/.config/claude/claude_desktop_config.json`:

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

### 4. Restart claude-desktop

The SkillAi tools should appear in the Claude tools panel.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `SKILLAI_TOKEN environment variable is required` | Set the env var in claude_desktop_config.json |
| JSON-RPC error `-32001` (401/403) | Token invalid — regenerate at `/settings/api-tokens` |
| JSON-RPC error `-32603` + `ECONNREFUSED` | Check `SKILLAI_URL` and that SkillAi is running |

Logs are written to **stderr**; check journalctl or claude-desktop's log output.

---

## License

MIT — part of the SkillAi repository.
See <https://github.com/olafkfreund/SkillAi/blob/main/LICENSE>.
