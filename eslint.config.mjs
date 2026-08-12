import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, globalIgnores } from "eslint/config";
import prettier from "eslint-config-prettier/flat";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import noSecrets from "eslint-plugin-no-secrets";
import security from "eslint-plugin-security";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import unusedImports from "eslint-plugin-unused-imports";
import tseslint from "typescript-eslint";

const tsconfigRootDir = dirname(fileURLToPath(import.meta.url));
const typescriptFiles = ["**/*.{ts,tsx,mts,cts}"];
const testFiles = ["**/__tests__/**/*.{ts,tsx}", "**/*.{test,spec}.{ts,tsx}"];
const appRouteFiles = ["src/app/**/route.ts"];
const clientRuntimeFiles = [
  "src/app/**/components/**/*.{ts,tsx}",
  "src/app/**/hooks/**/*.{ts,tsx}",
  "src/components/**/*.{ts,tsx}",
  "src/hooks/**/*.{ts,tsx}",
];
const serverRuntimeFiles = [
  "src/app/**/route.ts",
  "src/i18n/**/*.{ts,tsx}",
  "src/instrumentation.ts",
  "src/lib/**/*.{ts,tsx}",
  "src/proxy.ts",
];

const typeCheckedConfig = tseslint.configs.recommendedTypeChecked.map(
  (config) => ({
    ...config,
    files: config.files ?? typescriptFiles,
  })
);

const eslintConfig = defineConfig([
  {
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
  },
  ...nextVitals,
  ...nextTs,
  ...typeCheckedConfig,
  {
    files: typescriptFiles,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir,
      },
    },
    plugins: {
      "no-secrets": noSecrets,
      security,
      "simple-import-sort": simpleImportSort,
      "unused-imports": unusedImports,
    },
    rules: {
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-check": false,
          "ts-expect-error": "allow-with-description",
          "ts-ignore": true,
          "ts-nocheck": true,
          minimumDescriptionLength: 10,
        },
      ],
      "@typescript-eslint/consistent-type-exports": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          fixStyle: "inline-type-imports",
          prefer: "type-imports",
        },
      ],
      "@typescript-eslint/no-floating-promises": [
        "error",
        {
          ignoreIIFE: true,
          ignoreVoid: true,
        },
      ],
      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          checksVoidReturn: {
            attributes: false,
          },
        },
      ],
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        {
          allowBoolean: true,
          allowNever: true,
          allowNullish: true,
          allowNumber: true,
          allowRegExp: true,
        },
      ],
      "@typescript-eslint/switch-exhaustiveness-check": [
        "error",
        {
          considerDefaultExhaustiveForUnions: true,
        },
      ],
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-script-url": "error",
      "no-unused-vars": "off",
      "react/no-danger": "error",
      "security/detect-bidi-characters": "error",
      "security/detect-buffer-noassert": "error",
      "security/detect-child-process": "error",
      "security/detect-eval-with-expression": "error",
      "security/detect-new-buffer": "error",
      "security/detect-pseudoRandomBytes": "error",
      "security/detect-unsafe-regex": "error",
      "simple-import-sort/exports": "error",
      "simple-import-sort/imports": "error",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "error",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          vars: "all",
          varsIgnorePattern: "^_",
        },
      ],
      "no-secrets/no-secrets": [
        "error",
        {
          tolerance: 4.8,
        },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/instrumentation.ts",
      "src/lib/public-origin.ts",
      "src/lib/server-env.ts",
    ],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message:
            "Read environment variables through @/lib/server-env or @/lib/public-origin so secrets stay centralized.",
        },
      ],
    },
  },
  {
    files: clientRuntimeFiles,
    rules: {
      "no-console": [
        "error",
        {
          allow: ["error", "info", "warn"],
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "node:*",
                "fs",
                "path",
                "crypto",
                "ws",
                "livekit-server-sdk",
                "@/lib/server-env",
                "@/lib/translation-bridge/**",
                "@/lib/translation-session-manager",
              ],
              message:
                "Client runtime code must not import server-only modules or Node-only packages.",
            },
          ],
        },
      ],
    },
  },
  {
    files: serverRuntimeFiles,
    ignores: testFiles,
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "document",
          message:
            "Server runtime code must not access browser globals. Move this into a client component/hook.",
        },
        {
          name: "localStorage",
          message:
            "Server runtime code must not access browser globals. Move this into a client component/hook.",
        },
        {
          name: "sessionStorage",
          message:
            "Server runtime code must not access browser globals. Move this into a client component/hook.",
        },
        {
          name: "window",
          message:
            "Server runtime code must not access browser globals. Move this into a client component/hook.",
        },
      ],
    },
  },
  {
    files: appRouteFiles,
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.object.name=/^(req|request)$/][callee.property.name='json']",
          message:
            "Use readJsonObject/readJsonBody from @/lib/api-request and validate unknown input before using it.",
        },
      ],
    },
  },
  {
    files: testFiles,
    rules: {
      "@typescript-eslint/unbound-method": "off",
      "no-secrets/no-secrets": "off",
    },
  },
  prettier,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
