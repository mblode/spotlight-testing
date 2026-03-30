import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { SyncResult } from "./types.js";
import { getTrackedFiles } from "./git.js";

const DEFAULT_PROTECTED = [
  ".env",
  ".env.local",
  ".env.chamber",
  ".env.ngrok",
  "**/.env",
  "**/.env.local",
  "**/.env.chamber",
  "**/.env.ngrok",
];

const isProtected = (file: string, patterns: string[]): boolean => {
  for (const pattern of patterns) {
    if (pattern.startsWith("**/")) {
      const suffix = pattern.slice(3);
      if (file === suffix || file.endsWith(`/${suffix}`)) {
        return true;
      }
    } else if (file === pattern || file.endsWith(`/${pattern}`)) {
      return true;
    }
  }
  return false;
};

/** Sync git-tracked files from source to target using rsync */
export const syncFiles = (
  source: string,
  target: string,
  previousFiles: Set<string>,
  protect: string[] = [],
  includeUntracked = true,
): SyncResult => {
  const allProtected = [...DEFAULT_PROTECTED, ...protect];
  const warnings: string[] = [];

  const allFiles = getTrackedFiles(source, includeUntracked);
  const files = allFiles.filter((f) => !isProtected(f, allProtected));
  const currentFiles = new Set(files);

  const fileListPath = join(tmpdir(), "spotlight-filelist.txt");
  writeFileSync(fileListPath, `${files.join("\n")}\n`);

  try {
    execFileSync("rsync", ["-a", "--files-from", fileListPath, `${source}/`, `${target}/`], {
      encoding: "utf8",
      stdio: "pipe",
    });
  } finally {
    try {
      unlinkSync(fileListPath);
    } catch {
      // ignore cleanup errors
    }
  }

  let deleted = 0;
  for (const file of previousFiles) {
    if (!currentFiles.has(file) && !isProtected(file, allProtected)) {
      const targetFile = join(target, file);
      if (existsSync(targetFile)) {
        unlinkSync(targetFile);
        deleted += 1;
      }
    }
  }

  const configFiles = new Set([
    "docker-compose.yml",
    "docker-compose.local.yml",
    "Makefile",
    "Dockerfile",
  ]);
  for (const file of files) {
    const basename = file.split("/").pop() ?? "";
    if (configFiles.has(basename) || configFiles.has(file)) {
      warnings.push(`Config changed: ${file} (may need container restart)`);
    }
  }

  return { deleted, synced: files.length, warnings };
};

/** Create the rsync target directory if a file needs it */
export const ensureParentDir = (filePath: string): void => {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
};
