import { defineConfig } from "tsdown";

const removeUnsupportedInputOptions = (buildOptions: Record<string, unknown>): void => {
  delete buildOptions.define;
  delete buildOptions.inject;
};

export default defineConfig([
  {
    clean: true,
    dts: false,
    entry: { cli: "src/cli.ts" },
    format: ["esm"],
    hooks: {
      "build:before": ({ buildOptions }): void => {
        removeUnsupportedInputOptions(buildOptions as Record<string, unknown>);
      },
    },
    sourcemap: true,
    target: "node22",
  },
  {
    dts: true,
    entry: { index: "src/index.ts" },
    format: ["esm"],
    hooks: {
      "build:before": ({ buildOptions }): void => {
        removeUnsupportedInputOptions(buildOptions as Record<string, unknown>);
      },
    },
    sourcemap: true,
    target: "node22",
  },
]);
