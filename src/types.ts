export interface SpotlightOptions {
  /** Path to the git worktree to sync from */
  worktree: string
  /** Path to the main repo directory to sync into */
  target: string
  /** File patterns to never sync (glob-style) */
  protect?: string[]
  /** Debounce interval in ms for file watcher */
  debounce?: number
  /** Whether to include untracked (non-ignored) files */
  includeUntracked?: boolean
}

export interface SpotlightState {
  originalBranch: string
  stashName: string | null
  worktreeBranch: string
  worktreePath: string
  targetPath: string
  pid: number
  startedAt: string
}

export interface SyncResult {
  synced: number
  deleted: number
  warnings: string[]
}
