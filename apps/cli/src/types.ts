export interface SpotlightOptions {
  /** Path to the git worktree to sync from */
  worktree: string;
  /** Path to the main repo directory to sync into */
  target: string;
  /** Debounce interval in ms for file watcher */
  debounce?: number;
}

export interface SpotlightState {
  schemaVersion: number;
  pid: number;
  startedAt: string;
  lastSyncAt: string | null;
  targetCheckpointId: string;
  targetPath: string;
  targetRestoreLabel: string;
  watchBackend: string;
  workspaceCheckpointCommit: string;
  workspaceCheckpointId: string;
  worktreeBranch: string;
  worktreePath: string;
}

export interface SyncResult {
  changedPaths: string[];
  changedState: boolean;
  checkpointCommit: string;
  checkpointId: string;
  synced: number;
}

export interface CheckpointSaveOptions {
  force?: boolean;
  id?: string;
}

export interface CheckpointMetadata {
  commit: string;
  created: string;
  head: string;
  id: string;
  indexTree: string;
  worktreeTree: string;
}
