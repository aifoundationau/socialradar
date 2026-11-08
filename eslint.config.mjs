import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // React Compiler advisories. The flagged effects work; they are refactoring opportunities (mostly
    // "setState inside an effect" on modal open / data load), kept visible as warnings so `npm run lint`
    // can gate on real errors while they are cleaned up gradually.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Cloud-sync duplicates such as "page (1).tsx" (also excluded in tsconfig.json). Parentheses are glob
    // syntax, so they're escaped.
    "**/* \\(*\\).*",
  ]),
]);

export default eslintConfig;
