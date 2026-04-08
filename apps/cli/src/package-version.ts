import { readFileSync } from "node:fs";

let cachedVersion: string | null = null;

export const getPackageVersion = (): string => {
  if (cachedVersion) {
    return cachedVersion;
  }

  try {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as {
      version?: unknown;
    };

    if (typeof packageJson.version === "string" && packageJson.version.length > 0) {
      cachedVersion = packageJson.version;
      return cachedVersion;
    }
  } catch {
    // Fall through to the fallback version when package metadata is unavailable.
  }

  cachedVersion = "0.0.0";
  return cachedVersion;
};
