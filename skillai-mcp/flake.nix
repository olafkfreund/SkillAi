{
  description = "SkillAi MCP stdio bridge — connects claude-desktop to SkillAi /api/mcp";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.11";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    let
      # NixOS module and overlay are system-independent; defined once outside
      # eachDefaultSystem so they can be used in nixosModules / overlays.
      moduleFile = ./module.nix;
    in
    (flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        # ── Packages ──────────────────────────────────────────────────────────
        packages = rec {
          skillai-mcp = pkgs.buildNpmPackage {
            pname = "skillai-mcp";
            version = "1.0.0";

            src = ./.;

            nodejs = pkgs.nodejs_22;

            # Replace lib.fakeHash with the real hash after the first `nix build`.
            # Run: nix build 2>&1 | grep 'got:' | awk '{print $2}'
            # Then set: npmDepsHash = "<printed hash>";
            npmDepsHash = pkgs.lib.fakeHash;

            # Build the TypeScript source into dist/
            npmBuildScript = "build";

            # The binary is at dist/index.js — make it executable
            postInstall = ''
              chmod +x $out/lib/node_modules/skillai-mcp/dist/index.js
            '';

            meta = with pkgs.lib; {
              description = "Stdio MCP bridge connecting claude-desktop to SkillAi /api/mcp";
              homepage = "https://github.com/olafkfreund/SkillAi";
              license = licenses.mit;
              maintainers = [ ];
              platforms = platforms.all;
              mainProgram = "skillai-mcp";
            };
          };

          default = skillai-mcp;
        };

        # ── Dev shell ─────────────────────────────────────────────────────────
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_22
            nodePackages.typescript
            # tsx is installed via npm in node_modules; expose it via npx
          ];
          shellHook = ''
            echo "[skillai-mcp] Dev shell ready (Node $(node --version))"
            echo "  npm run dev    — watch + reload"
            echo "  npm run build  — compile TypeScript"
            echo "  npm start      — run compiled bridge"
          '';
        };
      }
    )) // {
      # ── Overlay ───────────────────────────────────────────────────────────
      # Add to nixpkgs so pkgs.skillai-mcp resolves in system configs:
      #   nixpkgs.overlays = [ inputs.skillai-mcp.overlays.default ];
      overlays.default = final: _prev: {
        skillai-mcp = self.packages.${final.system}.skillai-mcp;
      };

      # ── NixOS module ──────────────────────────────────────────────────────
      # The module is imported with pkgs extended to include skillai-mcp so
      # programs.skillai-mcp.package resolves automatically without the user
      # having to add the overlay separately.
      nixosModules.skillai-mcp = { pkgs, ... }@args:
        import moduleFile (args // {
          pkgs = pkgs.extend (_final: _prev: {
            skillai-mcp = self.packages.${pkgs.system}.skillai-mcp;
          });
        });
    };
}
