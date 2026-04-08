import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { getPackageVersion } from "../src/package-version.js";

describe("package version", () => {
  test("reads the current package version from package.json", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as {
      version: string;
    };

    expect(getPackageVersion()).toBe(packageJson.version);
  });
});
