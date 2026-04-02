import { resolve } from "node:path";

import {
  deleteCheckpoint,
  getCheckpointChangedPaths,
  getCheckpointCommit,
  readCheckpointMetadata,
  restoreCheckpoint,
  saveCheckpoint,
} from "./checkpointer.js";
import {
  getGitBranch,
  getGitBusyState,
  getGitRoot,
  getHeadLabel,
  getShortSha,
  isGitRepo,
  isSameRepo,
} from "./git.js";
import {
  isLocked,
  readLockfile,
  removeLockfile,
  waitForLockfileRelease,
  writeLockfile,
} from "./lockfile.js";
import { formatCommit, showActivity, showError, showInfo, showSuccess } from "./output.js";
import type { SpotlightOptions, SpotlightState, SyncResult } from "./types.js";
import { createWatcher } from "./watcher.js";
import type { WatcherHandle } from "./watcher.js";

// eslint-disable-next-line no-empty-function -- intentional keepalive noop
const noop = () => {};
const LOCK_SCHEMA_VERSION = 2;
const WATCH_BACKEND = "fs.watch(serialized)";

interface NormalizedPaths {
  target: string;
  worktree: string;
}

interface CheckpointDiff {
  changedPaths: string[];
  changedState: boolean;
}

const formatBusyState = (busyState: ReturnType<typeof getGitBusyState>): string => {
  switch (busyState) {
    case "busy:rebase": {
      return "a rebase is in progress";
    }
    case "busy:merge": {
      return "a merge is in progress";
    }
    case "busy:cherry-pick": {
      return "a cherry-pick is in progress";
    }
    case "busy:revert": {
      return "a revert is in progress";
    }
    case "clean": {
      return "clean";
    }
    default: {
      return "unknown Git state";
    }
  }
};

const getWorktreeLabel = (cwd: string): string => {
  const branch = getGitBranch(cwd);
  return branch === "HEAD" ? "detached" : branch;
};

const getRepoRoot = (dir: string, label: string): string => {
  if (!isGitRepo(dir)) {
    throw new Error(`${label} is not a git repository: ${dir}`);
  }

  return getGitRoot(dir);
};

const getNormalizedPaths = (worktreePath: string, targetPath: string): NormalizedPaths => {
  const worktree = getRepoRoot(worktreePath, "Worktree");
  const target = getRepoRoot(targetPath, "Target");

  return {
    target,
    worktree,
  };
};

const ensureReadyForSpotlight = (worktree: string, target: string): void => {
  if (worktree === target) {
    throw new Error("Worktree and target must be different directories");
  }

  if (!isSameRepo(worktree, target)) {
    throw new Error("Worktree and target must share the same git object database");
  }

  const worktreeBusyState = getGitBusyState(worktree);
  if (worktreeBusyState !== "clean") {
    throw new Error(`Cannot start Spotlight: ${formatBusyState(worktreeBusyState)} in worktree.`);
  }

  const targetBusyState = getGitBusyState(target);
  if (targetBusyState !== "clean") {
    throw new Error(`Cannot start Spotlight: ${formatBusyState(targetBusyState)} in target.`);
  }
};

const ensureCheckpointsDeleted = (cwd: string, checkpointIds: string[]): void => {
  for (const checkpointId of checkpointIds) {
    try {
      deleteCheckpoint(cwd, checkpointId);
    } catch {
      // Ignore checkpoint cleanup failures during shutdown.
    }
  }
};

const checkpointStateChanged = (
  cwd: string,
  previousRef: string,
  nextRef: string,
): CheckpointDiff => {
  const previousMetadata = readCheckpointMetadata(cwd, previousRef);
  const nextMetadata = readCheckpointMetadata(cwd, nextRef);

  return {
    changedPaths: getCheckpointChangedPaths(cwd, previousRef, nextRef),
    changedState:
      previousMetadata.head !== nextMetadata.head ||
      previousMetadata.indexTree !== nextMetadata.indexTree ||
      previousMetadata.worktreeTree !== nextMetadata.worktreeTree,
  };
};

const applyWorkspaceCheckpoint = (
  worktree: string,
  target: string,
  workspaceCheckpointId: string,
  previousRef: string,
): SyncResult => {
  saveCheckpoint(worktree, { force: true, id: workspaceCheckpointId });
  const checkpointCommit = getCheckpointCommit(worktree, workspaceCheckpointId);
  const diff = checkpointStateChanged(target, previousRef, checkpointCommit);

  if (diff.changedState) {
    restoreCheckpoint(target, workspaceCheckpointId);
  }

  return {
    changedPaths: diff.changedPaths,
    changedState: diff.changedState,
    checkpointCommit,
    checkpointId: workspaceCheckpointId,
    synced: diff.changedPaths.length,
  };
};

const restoreFromState = (state: SpotlightState): string => {
  restoreCheckpoint(state.targetPath, state.targetCheckpointId);
  ensureCheckpointsDeleted(state.targetPath, [
    state.workspaceCheckpointId,
    state.targetCheckpointId,
  ]);
  removeLockfile(state.targetPath);
  return state.targetRestoreLabel;
};

const replaceRunningSpotlight = (target: string): void => {
  const existing = readLockfile(target);

  if (!existing) {
    return;
  }

  if (existing.pid === process.pid) {
    throw new Error("Spotlight is already active in this process.");
  }

  showActivity(`Replacing spotlight from ${existing.worktreePath} (PID ${existing.pid})...`);

  try {
    process.kill(existing.pid, "SIGTERM");
  } catch {
    if (!isLocked(target)) {
      return;
    }
  }

  waitForLockfileRelease(existing.pid, target);
};

const shouldSkipSync = (worktree: string, target: string): boolean => {
  const worktreeBusyState = getGitBusyState(worktree);
  if (worktreeBusyState !== "clean") {
    showActivity(`Skipping sync: ${formatBusyState(worktreeBusyState)} in worktree`);
    return true;
  }

  const targetBusyState = getGitBusyState(target);
  if (targetBusyState !== "clean") {
    showActivity(`Skipping sync: ${formatBusyState(targetBusyState)} in target`);
    return true;
  }

  return false;
};

export const syncOnce = (worktreePath: string, targetPath: string): SyncResult => {
  const { target, worktree } = getNormalizedPaths(resolve(worktreePath), resolve(targetPath));

  ensureReadyForSpotlight(worktree, target);

  const suffix = `${Math.floor(Date.now() / 1000)}-${process.pid}`;
  const targetCheckpointId = `cp-sync-target-${suffix}`;
  const workspaceCheckpointId = `cp-sync-workspace-${suffix}`;
  let targetCheckpointSaved = false;
  let workspaceCheckpointSaved = false;
  let completed = false;

  try {
    saveCheckpoint(target, { id: targetCheckpointId });
    targetCheckpointSaved = true;

    const targetCheckpointCommit = getCheckpointCommit(target, targetCheckpointId);
    const result = applyWorkspaceCheckpoint(
      worktree,
      target,
      workspaceCheckpointId,
      targetCheckpointCommit,
    );
    workspaceCheckpointSaved = true;
    completed = true;
    return result;
  } catch (error) {
    if (targetCheckpointSaved) {
      try {
        restoreCheckpoint(target, targetCheckpointId);
      } catch {
        // Ignore rollback failures while surfacing the original sync error.
      }
    }

    throw error;
  } finally {
    if (completed || targetCheckpointSaved || workspaceCheckpointSaved) {
      ensureCheckpointsDeleted(target, [workspaceCheckpointId, targetCheckpointId]);
    }
  }
};

export const restore = (targetPath: string): void => {
  const target = isGitRepo(targetPath) ? getGitRoot(targetPath) : resolve(targetPath);
  const state = readLockfile(target);

  if (!state) {
    throw new Error("No spotlight state found. Nothing to restore.");
  }

  if (target !== state.targetPath) {
    throw new Error(`Lockfile target mismatch: expected ${state.targetPath}`);
  }

  restoreFromState(state);
};

export const spotlight = (options: SpotlightOptions): void => {
  const { target, worktree } = getNormalizedPaths(
    resolve(options.worktree),
    resolve(options.target),
  );
  const debounce = options.debounce ?? 300;

  ensureReadyForSpotlight(worktree, target);

  if (isLocked(target)) {
    replaceRunningSpotlight(target);
  }

  const checkpointSuffix = `${Math.floor(Date.now() / 1000)}-${process.pid}`;
  const targetCheckpointId = `cp-target-restore-${checkpointSuffix}`;
  const workspaceCheckpointId = `cp-spotlight-${checkpointSuffix}`;
  const worktreeBranch = getWorktreeLabel(worktree);
  const targetRestoreLabel = getHeadLabel(target);
  let state: SpotlightState | null = null;
  let targetCheckpointSaved = false;
  let workspaceCheckpointSaved = false;
  let cleaningUp = false;
  let keepAlive: ReturnType<typeof setInterval> | null = null;
  let watcher: WatcherHandle | null = null;
  showInfo("Starting spotlight...");

  const cleanup = (): void => {
    if (cleaningUp) {
      return;
    }

    cleaningUp = true;
    showInfo("Stopping spotlight...");

    if (keepAlive) {
      clearInterval(keepAlive);
    }

    try {
      watcher?.close();
    } catch {
      // Ignore watcher shutdown failures so restore cleanup still runs.
    }

    try {
      if (state) {
        restoreFromState(state);
      } else if (targetCheckpointSaved) {
        restoreCheckpoint(target, targetCheckpointId);
        ensureCheckpointsDeleted(target, [workspaceCheckpointId, targetCheckpointId]);
        removeLockfile(target);
      }
    } catch (error) {
      showError(`Cleanup error: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }

    showSuccess("Spotlight stopped");
  };

  const handleSigint = (): void => {
    cleanup();
    process.exit(0);
  };

  const handleSigterm = (): void => {
    cleanup();
    process.exit(0);
  };

  process.on("SIGINT", handleSigint);
  process.on("SIGTERM", handleSigterm);

  try {
    saveCheckpoint(target, { id: targetCheckpointId });
    targetCheckpointSaved = true;

    const initialResult = applyWorkspaceCheckpoint(
      worktree,
      target,
      workspaceCheckpointId,
      getCheckpointCommit(target, targetCheckpointId),
    );
    workspaceCheckpointSaved = true;

    state = {
      lastSyncAt: new Date().toISOString(),
      pid: process.pid,
      schemaVersion: LOCK_SCHEMA_VERSION,
      startedAt: new Date().toISOString(),
      targetCheckpointId,
      targetPath: target,
      targetRestoreLabel,
      watchBackend: WATCH_BACKEND,
      workspaceCheckpointCommit: initialResult.checkpointCommit,
      workspaceCheckpointId,
      worktreeBranch,
      worktreePath: worktree,
    };

    writeLockfile(state, target);
    showSuccess("Spotlight started");
  } catch (error) {
    process.off("SIGINT", handleSigint);
    process.off("SIGTERM", handleSigterm);

    if (targetCheckpointSaved) {
      try {
        restoreCheckpoint(target, targetCheckpointId);
      } catch {
        // Ignore rollback failures while surfacing the original startup error.
      }
    }

    if (targetCheckpointSaved || workspaceCheckpointSaved) {
      ensureCheckpointsDeleted(target, [workspaceCheckpointId, targetCheckpointId]);
    }

    throw error;
  }

  watcher = createWatcher({
    debounceMs: debounce,
    dir: worktree,
    onSync: () => {
      if (!state) {
        return;
      }

      try {
        if (shouldSkipSync(worktree, target)) {
          return;
        }

        const previousCommit = state.workspaceCheckpointCommit;
        const result = applyWorkspaceCheckpoint(
          worktree,
          target,
          workspaceCheckpointId,
          previousCommit,
        );

        if (!result.changedState) {
          return;
        }

        state.lastSyncAt = new Date().toISOString();
        state.workspaceCheckpointCommit = result.checkpointCommit;
        writeLockfile(state, target);

        showActivity(
          `Synced: ${result.synced} changed files (${formatCommit(getShortSha(result.checkpointCommit))})`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        showError(`Sync error: ${message}`);
      }
    },
  });

  keepAlive = setInterval(noop, 2_147_483_647);
};
