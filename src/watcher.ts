import { watch, type FSWatcher } from "node:fs"

import { getTrackedFiles } from "./git.js"

export interface WatcherOptions {
  dir: string
  debounceMs?: number
  includeUntracked?: boolean
  onSync: () => void
}

export function createWatcher(options: WatcherOptions): FSWatcher {
  const { dir, debounceMs = 300, includeUntracked = true, onSync } = options

  let trackedSet = new Set(getTrackedFiles(dir, includeUntracked))
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let hasPending = false

  // Refresh tracked files periodically
  const refreshInterval = setInterval(() => {
    try {
      trackedSet = new Set(getTrackedFiles(dir, includeUntracked))
    } catch {
      // git command failed, keep previous set
    }
  }, 30_000)

  const watcher = watch(dir, { recursive: true }, (_event, filename) => {
    if (!filename) return

    // Skip common non-tracked paths
    if (
      filename.includes("node_modules") ||
      filename.includes(".git/") ||
      filename.includes("dist/") ||
      filename.startsWith(".git/")
    ) {
      return
    }

    // Only sync if the file is tracked
    if (!trackedSet.has(filename)) return

    hasPending = true

    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      if (hasPending) {
        hasPending = false
        onSync()
      }
    }, debounceMs)
  })

  // Clean up interval when watcher closes
  watcher.on("close", () => {
    clearInterval(refreshInterval)
    if (debounceTimer) clearTimeout(debounceTimer)
  })

  return watcher
}
