import { defineConfig } from "tsdown";

export default defineConfig([
  {
    banner: { js: "#!/usr/bin/env node" },
    clean: true,
    entry: { cli: "src/cli.ts" },
    format: ["esm"],
    sourcemap: true,
    target: "node22",
  },
  {
    dts: true,
    entry: { index: "src/index.ts" },
    format: ["esm"],
    sourcemap: true,
    target: "node22",
  },
]);
