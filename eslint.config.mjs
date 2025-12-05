import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    // Only ignore build outputs, not source code
    ignores: [
      "dist/**",
      "electron-dist/**",
      "node_modules/**",
      "release/**",
      "*.config.{js,mjs,cjs}",
    ],
  },
  {
    // Lint all TypeScript files in src/ and electron/
    files: ["src/**/*.{ts,tsx}", "electron/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      // TypeScript-specific rules
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Allow empty catch blocks (common in electron error handling)
      "no-empty": ["error", { allowEmptyCatch: true }],
      // Allow console in electron main process
      "no-console": "off",
    },
  },
];
