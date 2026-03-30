import { resolve } from "node:path"
import { styleText } from "node:util"

import type { SpotlightOptions, SpotlightState, SyncResult } from "./types.js"
import { getGitBranch, getTrackedFiles, isDirty, isGitRepo, isGitWorktree, stash, stashPop, discardChanges } from "./git.js"
import { syncFiles } from "./sync.js"
import { createWatcher } from "./watcher.js"
import { isLocked, readLockfile, removeLockfile, writeLockfile } from "./lockfile.js"

function timestamp(): string {
  return new Date().toLocaleTimeString("en-AU", { hour12: false })
}

function log(msg: string): void {
  console.log(styleText("dim", `[${timestamp()}]`), msg)
}

/** Run a one-time sync from worktree to target */
export function syncOnce(worktree: string, target: string, protect: string[] = []): SyncResult {
  const previousFiles = new Set(getTrackedFiles(target, true))
  return syncFiles(worktree, target, previousFiles, protect, true)
}

/** Restore the target directory to its pre-spotlight state */
export function restore(target: string): void {
  const state = readLockfile()
  if (!state) {
    discardChanges(target)
    return
  }

  discardChanges(target)
  if (state.stashName) {
    stashPop(target, state.stashName)
  }
  removeLockfile()
}

/** Start spotlight: watch a worktree and sync changes into the target */
export async function spotlight(options: SpotlightOptions): Promise<void> {
  const worktree = resolve(options.worktree)
  const target = resolve(options.target)
  const protect = options.protect ?? []
  const debounce = options.debounce ?? 300
  const includeUntracked = options.includeUntracked ?? true

  // Validation
  if (!isGitWorktree(worktree) && !isGitRepo(worktree)) {
    throw new Error(`Not a git repository or worktree: ${worktree}`)
  }
  if (!isGitRepo(target)) {
    throw new Error(`Target is not a git repository: ${target}`)
  }
  if (worktree === target) {
    throw new Error("Worktree and target must be different directories")
  }
  if (isLocked()) {
    const existing = readLockfile()
    throw new Error(
      `Spotlight is already running (PID ${existing?.pid}, syncing ${existing?.worktreePath}). Run "spotlight off" first.`,
    )
  }

  // Save state
  const originalBranch = getGitBranch(target)
  let stashName: string | null = null
  if (isDirty(target)) {
    log("Stashing uncommitted changes in target directory...")
    stashName = stash(target)
  }

  const worktreeBranch = getGitBranch(worktree)

  const state: SpotlightState = {
    originalBranch,
    stashName,
    worktreeBranch,
    worktreePath: worktree,
    targetPath: target,
    pid: process.pid,
    startedAt: new Date().toISOString(),
  }
  writeLockfile(state)

  console.log("")
  console.log(styleText("bold", "Spotlight ON"))
  console.log(`  Branch:   ${styleText("cyan", worktreeBranch)}`)
  console.log(`  From:     ${worktree}`)
  console.log(`  Into:     ${target}`)
  console.log("")

  // Initial sync
  let previousFiles = new Set(getTrackedFiles(worktree, includeUntracked))
  const initial = syncFiles(worktree, target, new Set(), protect, includeUntracked)
  log(`Initial sync: ${initial.synced} files`)
  for (const w of initial.warnings) {
    console.log(styleText("yellow", `  Warning: ${w}`))
  }

  // Watch for changes
  const watcher = createWatcher({
    dir: worktree,
    debounceMs: debounce,
    includeUntracked,
    onSync: () => {
      try {
        const result = syncFiles(worktree, target, previousFiles, protect, includeUntracked)
        previousFiles = new Set(getTrackedFiles(worktree, includeUntracked))

        const parts = [`${result.synced} files`]
        if (result.deleted > 0) parts.push(`${result.deleted} deleted`)
        log(`Synced: ${parts.join(", ")}`)

        for (const w of result.warnings) {
          console.log(styleText("yellow", `  Warning: ${w}`))
        }
      } catch (err) {
        console.error(styleText("red", `Sync error: ${err}`))
      }
    },
  })

  console.log(styleText("dim", "Watching for changes... (Ctrl+C to stop)"))
  console.log("")

  // Cleanup on exit
  const cleanup = () => {
    console.log("")
    log("Shutting down spotlight...")
    watcher.close()

    try {
      discardChanges(target)
      if (stashName) {
        stashPop(target, stashName)
        log(`Restored stash: ${stashName}`)
      }
      log(`Restored ${target} to ${originalBranch}`)
    } catch (err) {
      console.error(styleText("red", `Cleanup error: ${err}`))
    }

    removeLockfile()
    console.log(styleText("bold", "Spotlight OFF"))
  }

  process.on("SIGINT", () => {
    cleanup()
    process.exit(0)
  })
  process.on("SIGTERM", () => {
    cleanup()
    process.exit(0)
  })

  // Keep process alive
  await new Promise(() => {
    // Never resolves — process stays alive until signal
  })
}
