# olafkfreund/homebrew-tap

Custom Homebrew tap for SkillAi tools.

## Usage

```bash
brew tap olafkfreund/tap
brew install skillai-mcp
```

## Available formulas

- `skillai-mcp` — Stdio MCP bridge between claude-desktop and SkillAi /api/mcp

## Configuration

After install, set environment variables in your shell rc:

```bash
export SKILLAI_URL=https://your-skillai-host
export SKILLAI_TOKEN=skl_...
```

Or pass them via claude-desktop's mcp.config.json (see the formula's caveats output).

## Updating

When a new `skillai-mcp-vX.Y.Z` tag is released:

1. Get the SHA256 sums from the GitHub Release page
2. Run `brew bump-formula-pr --tag=skillai-mcp-vX.Y.Z --revision=<commit-sha> Formula/skillai-mcp.rb` (or hand-edit + PR)
