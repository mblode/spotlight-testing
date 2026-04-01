import { resolve } from "node:path";
import { styleText } from "node:util";

import { createCheckpoint } from "./checkpoint.js";
import {
  checkoutDetached,
  getGitBranch,
  getHeadState,
  gitPath,
  getShortSha,
  hasChanges,
  isGitRepo,
  isMergeInProgress,
  isRebaseInProgress,
  isSameRepo,
  restoreHeadState,
  stash,
  stashPop,
} from "./git.js";
import { isLocked, readLockfile, removeLockfile, writeLockfile } from "./lockfile.js";
import { buildSyncResult, parkProtectedFiles, restoreProtectedFiles } from "./sync.js";
import type { SpotlightOptions, SpotlightState, SyncResult } from "./types.js";
import { createWatcher } from "./watcher.js";

// eslint-disable-next-line no-empty-function -- intentional keepalive noop
const noop = () => {};
const sleepBuffer = new Int32Array(new SharedArrayBuffer(4));
const LOCK_REPLACEMENT_TIMEOUT_MS = 10_000;
const LOCK_REPLACEMENT_POLL_MS = 50;

const timestamp = (): string => new Date().toLocaleTimeString("en-AU", { hour12: false });

const log = (msg: string): void => {
  console.log(styleText("dim", `[${timestamp()}]`), msg);
};

const sleep = (ms: number): void => {
  Atomics.wait(sleepBuffer, 0, 0, ms);
};

const getWorktreeLabel = (cwd: string): string => {
  const branch = getGitBranch(cwd);
  return branch === "HEAD" ? "detached" : branch;
};

const ensureReadyForSpotlight = (worktree: string, target: string): void => {
  if (!isGitRepo(worktree)) {
    throw new Error(`Not a git repository or worktree: ${worktree}`);
  }

  if (!isGitRepo(target)) {
    throw new Error(`Target is not a git repository: ${target}`);
  }

  if (worktree === target) {
    throw new Error("Worktree and target must be different directories");
  }

  if (!isSameRepo(worktree, target)) {
    throw new Error("Worktree and target must share the same git object database");
  }

  if (isRebaseInProgress(worktree) || isMergeInProgress(worktree)) {
    throw new Error(
      "Cannot start Spotlight: rebase or merge in progress in worktree. Run `git rebase --continue` or `git merge --continue` to complete, or `--abort` to cancel.",
    );
  }

  if (isRebaseInProgress(target) || isMergeInProgress(target)) {
    throw new Error(
      "Cannot start Spotlight: rebase or merge in progress in target. Run `git rebase --continue` or `git merge --continue` to complete, or `--abort` to cancel.",
    );
  }
};

const restoreFromState = (state: SpotlightState): string => {
  let restoredTarget = "";
  const parked = parkProtectedFiles(state.targetPath, state.protect);

  try {
    restoredTarget = restoreHeadState(state.targetPath, state);

    if (state.stashName) {
      stashPop(state.targetPath, state.stashName);
    }
  } finally {
    restoreProtectedFiles(state.targetPath, parked);
  }

  removeLockfile();
  return restoredTarget;
};

const waitForSpotlightToStop = (
  expectedPid: number,
  timeoutMs = LOCK_REPLACEMENT_TIMEOUT_MS,
): void => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (!isLocked()) {
      return;
    }

    const active = readLockfile();
    if (!active || active.pid !== expectedPid) {
      return;
    }

    sleep(LOCK_REPLACEMENT_POLL_MS);
  }

  const active = readLockfile();
  throw new Error(
    `Timed out waiting for spotlight to stop${active ? ` (PID ${active.pid}, syncing ${active.worktreePath})` : ""}.`,
  );
};

const replaceRunningSpotlight = (): void => {
  const existing = readLockfile();

  if (!existing) {
    return;
  }

  if (existing.pid === process.pid) {
    throw new Error("Spotlight is already active in this process.");
  }

  log(`Replacing spotlight from ${existing.worktreePath} (PID ${existing.pid})...`);

  try {
    process.kill(existing.pid, "SIGTERM");
  } catch {
    if (!isLocked()) {
      return;
    }
  }

  waitForSpotlightToStop(existing.pid);
};

/** Run a one-time sync from worktree to target */
export const syncOnce = (
  worktreePath: string,
  targetPath: string,
  protect: string[] = [],
  includeUntracked = false,
): SyncResult => {
  const worktree = resolve(worktreePath);
  const target = resolve(targetPath);

  ensureReadyForSpotlight(worktree, target);

  const originalState = getHeadState(target);
  const commitSha = createCheckpoint(worktree, { includeUntracked, protect });
  const parked = parkProtectedFiles(target, protect);

  try {
    if (hasChanges(target)) {
      throw new Error("syncOnce requires a clean target working tree");
    }

    checkoutDetached(target, commitSha, true);
  } finally {
    restoreProtectedFiles(target, parked);
  }

  return buildSyncResult(target, originalState.originalHead, commitSha, protect);
};

/** Restore the target directory to its pre-spotlight state */
export const restore = (targetPath: string): void => {
  const state = readLockfile();

  if (!state) {
    throw new Error("No spotlight state found. Nothing to restore.");
  }

  if (resolve(targetPath) !== state.targetPath) {
    throw new Error(`Lockfile target mismatch: expected ${state.targetPath}`);
  }

  restoreFromState(state);
};

/** Start spotlight: watch a worktree and sync changes into the target */
export const spotlight = (options: SpotlightOptions): void => {
  const worktree = resolve(options.worktree);
  const target = resolve(options.target);
  const protect = options.protect ?? [];
  const debounce = options.debounce ?? 300;
  const includeUntracked = options.includeUntracked ?? false;

  ensureReadyForSpotlight(worktree, target);

  if (isLocked()) {
    replaceRunningSpotlight();
  }

  const originalState = getHeadState(target);
  const worktreeBranch = getWorktreeLabel(worktree);
  let stashName: string | null = null;
  let state: SpotlightState | null = null;

  const initialCheckpoint = createCheckpoint(worktree, { includeUntracked, protect });
  const initialParked = parkProtectedFiles(target, protect);

  try {
    if (hasChanges(target)) {
      log(`Stashing target changes in ${target} before spotlight...`);
      stashName = stash(target, true);
      if (stashName) {
        log(`Target stash: ${stashName} (${gitPath(target, "refs/stash")})`);
      }
    }

    checkoutDetached(target, initialCheckpoint, true);
  } catch (error) {
    restoreProtectedFiles(target, initialParked);

    if (stashName) {
      try {
        stashPop(target, stashName);
      } catch {
        // ignore restore failure while surfacing the original startup error
      }
    }

    throw error;
  }

  restoreProtectedFiles(target, initialParked);

  const initial = buildSyncResult(target, originalState.originalHead, initialCheckpoint, protect);

  state = {
    ...originalState,
    lastCheckpointSha: initial.commitSha,
    pid: process.pid,
    protect,
    startedAt: new Date().toISOString(),
    stashName,
    targetPath: target,
    worktreeBranch,
    worktreePath: worktree,
  };

  writeLockfile(state);

  console.log("");
  console.log(styleText("bold", "Spotlight ON"));
  console.log(`  Branch:   ${styleText("cyan", worktreeBranch)}`);
  console.log(`  From:     ${worktree}`);
  console.log(`  Into:     ${target}`);
  console.log(
    `  Restore:  ${originalState.originalBranch ?? `${getShortSha(originalState.originalHead)} (detached)`}`,
  );
  console.log("");

  log(`Initial checkpoint: ${initial.synced} changed files (${getShortSha(initial.commitSha)})`);
  for (const warning of initial.warnings) {
    console.log(styleText("yellow", `  Warning: ${warning}`));
  }

  const watcher = createWatcher({
    debounceMs: debounce,
    dir: worktree,
    onSync: () => {
      if (!state) {
        return;
      }

      try {
        const previousRef = state.lastCheckpointSha ?? state.originalHead;
        const commitSha = createCheckpoint(worktree, {
          baselineRef: previousRef,
          includeUntracked,
          protect,
        });

        if (commitSha === previousRef) {
          return;
        }

        const parked = parkProtectedFiles(target, protect);

        try {
          checkoutDetached(target, commitSha, true);
        } finally {
          restoreProtectedFiles(target, parked);
        }

        const result = buildSyncResult(target, previousRef, commitSha, protect);
        state.lastCheckpointSha = result.commitSha;
        writeLockfile(state);

        log(`Synced: ${result.synced} changed files (${getShortSha(result.commitSha)})`);

        for (const warning of result.warnings) {
          console.log(styleText("yellow", `  Warning: ${warning}`));
        }
      } catch (error) {
        console.error(
          styleText("red", `Sync error: ${error instanceof Error ? error.message : String(error)}`),
        );
      }
    },
  });

  console.log(styleText("dim", "Watching for changes... (Ctrl+C to stop)"));
  console.log("");

  let cleaningUp = false;
  const keepAlive = setInterval(noop, 2_147_483_647);

  const cleanup = (): void => {
    if (cleaningUp || !state) {
      return;
    }

    cleaningUp = true;
    console.log("");
    log("Shutting down spotlight...");
    watcher.close();
    clearInterval(keepAlive);

    try {
      const restoredTarget = restoreFromState(state);
      if (state.stashName) {
        log(`Restored stash: ${state.stashName} (${gitPath(target, "refs/stash")})`);
      }
      log(`Restored ${target} to ${restoredTarget}`);
    } catch (error) {
      console.error(
        styleText(
          "red",
          `Cleanup error: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    console.log(styleText("bold", "Spotlight OFF"));
  };

  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });
};
