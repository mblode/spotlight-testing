import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";

export default defineConfig({
  extends: [core],
  ignorePatterns: [...core.ignorePatterns, ".cmux/**"],
  rules: {
    "no-await-in-loop": "off",
    "prefer-number-coercion": "off",
    "require-unicode-regexp": "off",
    "text-encoding-identifier-case": "off",
    "unicorn/import-style": "off",
  },
});
