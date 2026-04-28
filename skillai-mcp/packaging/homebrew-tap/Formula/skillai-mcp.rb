# Formula for skillai-mcp — Stdio MCP bridge between claude-desktop and SkillAi /api/mcp
#
# OPERATOR NOTES
# --------------
# 1. After cutting a release tag (skillai-mcp-vX.Y.Z), download each artefact from the
#    GitHub Releases page and compute SHA256 sums:
#
#      shasum -a 256 skillai-mcp-darwin-arm64
#      shasum -a 256 skillai-mcp-darwin-x86_64
#      shasum -a 256 skillai-mcp-linux-arm64
#      shasum -a 256 skillai-mcp-linux-x86_64
#
# 2. Replace every REPLACE_WITH_SHA256_FROM_RELEASE_* placeholder below with the
#    corresponding digest.
#
# 3. Bump the `version` field to match the new tag.
#
# Alternatively, use:
#   brew bump-formula-pr --tag=skillai-mcp-vX.Y.Z --revision=<commit-sha> Formula/skillai-mcp.rb

class SkillaiMcp < Formula
  desc "Stdio MCP bridge between claude-desktop and SkillAi /api/mcp"
  homepage "https://github.com/olafkfreund/SkillAi"
  license "MIT"
  version "0.1.0"

  # GitHub Release artefact base URL — updated automatically by bump-formula-pr
  BASE_URL = "https://github.com/olafkfreund/SkillAi/releases/download/skillai-mcp-v#{version}"

  on_macos do
    if Hardware::CPU.arm?
      url "#{BASE_URL}/skillai-mcp-darwin-arm64"
      sha256 "REPLACE_WITH_SHA256_FROM_RELEASE_DARWIN_ARM64"
    else
      # Intel Mac
      url "#{BASE_URL}/skillai-mcp-darwin-x86_64"
      sha256 "REPLACE_WITH_SHA256_FROM_RELEASE_DARWIN_X86_64"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "#{BASE_URL}/skillai-mcp-linux-arm64"
      sha256 "REPLACE_WITH_SHA256_FROM_RELEASE_LINUX_ARM64"
    else
      # Intel / AMD64 Linux (Linuxbrew)
      url "#{BASE_URL}/skillai-mcp-linux-x86_64"
      sha256 "REPLACE_WITH_SHA256_FROM_RELEASE_LINUX_X86_64"
    end
  end

  # The release artefact is a single pre-compiled binary with no dependencies.
  # No bottle block needed — we are distributing the binary directly.

  def install
    # The downloaded artefact is a bare binary (no archive to unpack).
    # Dir["skillai-mcp*"].first handles both the case where the file retains
    # its platform suffix after download and the case where Homebrew strips it.
    bin.install Dir["skillai-mcp*"].first => "skillai-mcp"
  end

  def caveats
    <<~EOS
      skillai-mcp is a stdio bridge for the Model Context Protocol (MCP).
      It reads SKILLAI_URL and SKILLAI_TOKEN from the environment and proxies
      MCP JSON-RPC calls to your SkillAi instance's /api/mcp endpoint.

      ── Environment variables ────────────────────────────────────────────────
      Add to your shell rc (~/.zshrc, ~/.bashrc, etc.):

        export SKILLAI_URL=https://your-skillai-host
        export SKILLAI_TOKEN=skl_...

      ── claude-desktop configuration ─────────────────────────────────────────
      Add the following block to your claude-desktop mcp.config.json
      (usually ~/Library/Application Support/Claude/mcp.config.json on macOS):

        {
          "mcpServers": {
            "skillai": {
              "command": "#{HOMEBREW_PREFIX}/bin/skillai-mcp",
              "env": {
                "SKILLAI_URL": "https://your-skillai-host",
                "SKILLAI_TOKEN": "skl_..."
              }
            }
          }
        }

      Restart claude-desktop after editing mcp.config.json.
      ─────────────────────────────────────────────────────────────────────────
    EOS
  end

  test do
    # With no SKILLAI_URL / SKILLAI_TOKEN set, the binary must exit non-zero
    # and print a diagnostic to stderr indicating the missing configuration.
    # We capture stderr and assert the expected message is present.
    output = shell_output("#{bin}/skillai-mcp 2>&1", 1)
    assert_match(/SKILLAI_URL|SKILLAI_TOKEN|missing|required|not set/i, output,
                 "Expected skillai-mcp to print a missing-env-var error when no " \
                 "SKILLAI_URL or SKILLAI_TOKEN is provided")
  end
end
