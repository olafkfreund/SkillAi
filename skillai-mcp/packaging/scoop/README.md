# olafkfreund/scoop-bucket

Custom Scoop bucket for SkillAi tools.

## Usage

```powershell
scoop bucket add skillai https://github.com/olafkfreund/scoop-bucket
scoop install skillai/skillai-mcp
```

## Available manifests

- `skillai-mcp` — Stdio MCP bridge between claude-desktop and SkillAi /api/mcp

## Configure

In your PowerShell profile or claude-desktop's `mcp.config.json`:

```json
{
  "mcpServers": {
    "skillai": {
      "command": "skillai-mcp",
      "env": {
        "SKILLAI_URL": "https://your-skillai-host",
        "SKILLAI_TOKEN": "skl_..."
      }
    }
  }
}
```

## Maintenance

The manifest's `checkver` + `autoupdate` blocks let Scoop auto-bump on new SkillAi releases. Manually trigger via:

```powershell
scoop checkver -u skillai-mcp
git diff bucket/skillai-mcp.json
git commit -am "skillai-mcp: bump to X.Y.Z"
git push
```
