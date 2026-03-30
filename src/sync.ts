import { execFileSync } from "node:child_process"
import { existsSync, unlinkSync, writeFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { mkdirSync } from "node:fs"
import { tmpdir } from "node:os"

import type { SyncResult } from "./types.js"
import { getTrackedFiles } from "./git.js"

const DEFAULT_PROTECTED = [
  ".env",
  ".env.local",
  ".env.chamber",
  ".env.ngrok",
  "**/.env",
  "**/.env.local",
  "**/.env.chamber",
  "**/.env.ngrok",
]

function isProtected(file: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (pattern.startsWith("**/")) {
      const suffix = pattern.slice(3)
      if (file === suffix || file.endsWith(`/${suffix}`)) return true
    } else if (file === pattern || file.endsWith(`/${pattern}`)) {
      return true
    }
  }
  return false
}

/** Sync git-tracked files from source to target using rsync */
export function syncFiles(
  source: string,
  target: string,
  previousFiles: Set<string>,
  protect: string[] = [],
  includeUntracked = true,
): SyncResult {
  const allProtected = [...DEFAULT_PROTECTED, ...protect]
  const warnings: string[] = []

  // Get current tracked files
  const allFiles = getTrackedFiles(source, includeUntracked)
  const files = allFiles.filter((f) => !isProtected(f, allProtected))
  const currentFiles = new Set(files)

  // Write file list to temp file for rsync
  const fileListPath = join(tmpdir(), "spotlight-filelist.txt")
  writeFileSync(fileListPath, files.join("\n") + "\n")

  // rsync tracked files
  try {
    execFileSync("rsync", ["-a", "--files-from", fileListPath, `${source}/`, `${target}/`], {
      encoding: "utf-8",
      stdio: "pipe",
    })
  } finally {
    try {
      unlinkSync(fileListPath)
    } catch {
      // ignore cleanup errors
    }
  }

  // Handle deletions: files in previous set but not in current set
  let deleted = 0
  for (const file of previousFiles) {
    if (!currentFiles.has(file) && !isProtected(file, allProtected)) {
      const targetFile = join(target, file)
      if (existsSync(targetFile)) {
        unlinkSync(targetFile)
        deleted++
      }
    }
  }

  // Warn about config file changes that may need container restart
  const configFiles = ["docker-compose.yml", "docker-compose.local.yml", "Makefile", "Dockerfile"]
  for (const file of files) {
    const basename = file.split("/").pop() ?? ""
    if (configFiles.includes(basename) || configFiles.includes(file)) {
      warnings.push(`Config changed: ${file} (may need container restart)`)
    }
  }

  return { synced: files.length, deleted, warnings }
}

/** Create the rsync target directory if a file needs it */
export function ensureParentDir(filePath: string): void {
  const dir = dirname(filePath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}
