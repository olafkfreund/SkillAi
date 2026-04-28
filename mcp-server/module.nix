{ config, lib, pkgs, ... }:
with lib;
let
  cfg = config.programs.skillai-mcp;
in {
  options.programs.skillai-mcp = {
    enable = mkEnableOption "SkillAi MCP stdio bridge for claude-desktop";

    package = mkOption {
      type = types.package;
      description = ''
        The skillai-mcp package to use.
        When using this module via the flake's nixosModules.skillai-mcp, this
        is set automatically. If using the module standalone, add
        nixpkgs.overlays = [ inputs.skillai-mcp.overlays.default ]; to your
        configuration so that pkgs.skillai-mcp resolves correctly.
      '';
      default = pkgs.skillai-mcp or (throw ''
        programs.skillai-mcp.package is not set and pkgs.skillai-mcp is not available.
        Either set programs.skillai-mcp.package explicitly, or add:
          nixpkgs.overlays = [ inputs.skillai-mcp.overlays.default ];
        to your NixOS configuration.
      '');
    };

    url = mkOption {
      type = types.str;
      default = "http://localhost:3000";
      example = "https://skillai.internal.example.com";
      description = ''
        Base URL of the SkillAi server (without /api/mcp suffix).
        Must start with http:// or https://.
      '';
    };

    tokenFile = mkOption {
      type = types.path;
      example = "/run/agenix/skillai-token";
      description = ''
        Path to a file containing the SKILLAI_TOKEN (one line, no trailing newline).
        The file must be readable by the user running claude-desktop.

        Recommended: store under /run/agenix/ or a similar secret-manager-managed
        path so the token never appears in /nix/store. Example with agenix:

          age.secrets."skillai-token" = {
            file = ../secrets/skillai-token.age;
            mode = "0440";
            owner = "youruser";
          };
          programs.skillai-mcp.tokenFile = config.age.secrets."skillai-token".path;
      '';
    };
  };

  config = mkIf cfg.enable {
    # A wrapper script that reads the token from the tokenFile at runtime,
    # sets the required environment variables, and execs the actual binary.
    # Installed to PATH so claude-desktop can find it as 'skillai-mcp'.
    environment.systemPackages = [
      (pkgs.writeShellApplication {
        name = "skillai-mcp";
        runtimeInputs = [ cfg.package ];
        text = ''
          if [ ! -r "${cfg.tokenFile}" ]; then
            echo "[skillai-mcp] Cannot read token file: ${cfg.tokenFile}" >&2
            exit 1
          fi
          export SKILLAI_TOKEN="$(cat "${cfg.tokenFile}")"
          export SKILLAI_URL="${cfg.url}"
          exec ${cfg.package}/bin/skillai-mcp "$@"
        '';
      })
    ];
  };
}
