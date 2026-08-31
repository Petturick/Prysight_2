import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".netlify/**",
    "node_modules/**",
    "coverage/**",
    "src/generated/**",
    "scripts/netlify-build-diagnostic.cjs",
  ]),
]);

export default eslintConfig;
