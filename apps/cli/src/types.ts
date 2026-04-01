export interface SpotlightOptions {
  /** Path to the git worktree to sync from */
  worktree: string;
  /** Path to the main repo directory to sync into */
  target: string;
  /** File patterns to never sync (glob-style) */
  protect?: string[];
  /** Debounce interval in ms for file watcher */
  debounce?: number;
  /** Whether to include untracked (non-ignored) files */
  includeUntracked?: boolean;
}

export interface HeadState {
  originalHead: string;
  originalBranch: string | null;
  isDetached: boolean;
}

export interface SpotlightState extends HeadState {
  protect: string[];
  lastCheckpointSha: string | null;
  stashName: string | null;
  worktreeBranch: string;
  worktreePath: string;
  targetPath: string;
  pid: number;
  startedAt: string;
}

export interface SyncResult {
  commitSha: string;
  synced: number;
  changedPaths: string[];
  warnings: string[];
}

export interface CheckpointOptions {
  baselineRef?: string;
  includeUntracked?: boolean;
  protect?: string[];
}

export interface ParkedProtectedFile {
  parkedPath: string;
  relativePath: string;
}

export interface ParkedProtectedFiles {
  files: ParkedProtectedFile[];
  root: string;
}
