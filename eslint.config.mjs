import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // eslint-plugin-react-hooks v7 introduced two new experimental rules that
    // fire on intentional, canonical patterns in this codebase:
    //
    //  • react-hooks/set-state-in-effect — fires on `useEffect(() => { setState(true) }, [])`
    //    which is the documented next-themes hydration pattern (ThemeToggle) and other
    //    sync init effects.  These are not cascading-render bugs; they are one-time
    //    mount-time initialisations.
    //
    //  • react-hooks/purity — fires on Date.now() inside async Server Components
    //    (dashboard/page.tsx) and .map() callbacks in Client Components.  Server
    //    Components are never re-rendered by React; the rule is a false positive there.
    //
    // Both rules are kept at "warn" so violations are still visible in development
    // and IDEs, but they must not block CI.  Re-evaluate when the rules graduate
    // from experimental in a future react-hooks release.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
    },
  },
]);

export default eslintConfig;
