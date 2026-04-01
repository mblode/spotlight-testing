import { mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

import type { ParkedProtectedFiles, SyncResult } from "./types.js";
import { getChangedFiles, gitPath } from "./git.js";
import { getProtectedPatterns, isProtectedPath } from "./protect.js";

const IGNORED_DIRECTORIES = new Set([".git", "dist", "node_modules"]);
const CONFIG_FILES = new Set([
  "docker-compose.yml",
  "docker-compose.local.yml",
  "Makefile",
  "Dockerfile",
]);

const ensureParentDir = (filePath: string): void => {
  mkdirSync(dirname(filePath), { recursive: true });
};

const walkFiles = (root: string, currentDir = root): string[] => {
  const files: string[] = [];

  for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }

      files.push(...walkFiles(root, join(currentDir, entry.name)));
      continue;
    }

    if (entry.name === ".DS_Store") {
      continue;
    }

    const absolutePath = join(currentDir, entry.name);
    files.push(absolutePath.slice(root.length + 1).replaceAll("\\", "/"));
  }

  return files;
};

const getWarningMessages = (changedPaths: string[]): string[] => {
  const warnings: string[] = [];

  for (const filePath of changedPaths) {
    const basename = filePath.split("/").at(-1) ?? filePath;

    if (CONFIG_FILES.has(filePath) || CONFIG_FILES.has(basename)) {
      warnings.push(`Config changed: ${filePath} (may need container restart)`);
    }
  }

  return warnings;
};

export const restoreProtectedFiles = (cwd: string, parked: ParkedProtectedFiles): void => {
  for (const file of parked.files) {
    const targetPath = join(cwd, file.relativePath);

    rmSync(targetPath, { force: true, recursive: true });
    ensureParentDir(targetPath);
    renameSync(file.parkedPath, targetPath);
  }

  rmSync(parked.root, { force: true, recursive: true });
};

export const parkProtectedFiles = (cwd: string, patterns: string[] = []): ParkedProtectedFiles => {
  const protectedPatterns = getProtectedPatterns(patterns);
  const files = walkFiles(cwd).filter((filePath) => isProtectedPath(filePath, protectedPatterns));
  const parkingRoot = mkdtempSync(
    join(dirname(gitPath(cwd, "spotlight-protected")), "spotlight-protected-"),
  );
  const parked: ParkedProtectedFiles = { files: [], root: parkingRoot };

  for (const filePath of files) {
    const targetPath = join(cwd, filePath);
    const parkedPath = join(parkingRoot, filePath);

    ensureParentDir(parkedPath);
    renameSync(targetPath, parkedPath);
    parked.files.push({ parkedPath, relativePath: filePath });
  }

  return parked;
};

export const buildSyncResult = (
  cwd: string,
  previousRef: string,
  commitSha: string,
  protect: string[] = [],
): SyncResult => {
  const protectedPatterns = getProtectedPatterns(protect);
  const changedPaths = getChangedFiles(cwd, previousRef, commitSha).filter(
    (filePath) => !isProtectedPath(filePath, protectedPatterns),
  );

  return {
    changedPaths,
    commitSha,
    synced: changedPaths.length,
    warnings: getWarningMessages(changedPaths),
  };
};
