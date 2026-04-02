import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { getGitCommonDir, isGitRepo } from "./git.js";
import type { SpotlightState } from "./types.js";

const DEFAULT_LOCKFILE_DIR = join(tmpdir(), "spotlight-testing");
const LOCKFILE_SCHEMA_VERSION = 2;
const LOCKFILE_WAIT_POLL_MS = 50;
const SCOPED_LOCKFILE_PREFIX = "repo-";
const sleepBuffer = new Int32Array(new SharedArrayBuffer(4));

const getScopedLockfilePath = (repoPath: string): string => {
  const repoKey = createHash("sha256").update(getGitCommonDir(repoPath)).digest("hex");
  return join(DEFAULT_LOCKFILE_DIR, `${SCOPED_LOCKFILE_PREFIX}${repoKey}.lock`);
};

const getCurrentLockfilePath = (repoPath?: string): string | null => {
  const explicitLockfile = process.env.SPOTLIGHT_LOCKFILE;

  if (explicitLockfile) {
    return explicitLockfile;
  }

  const resolvedRepoPath = repoPath ?? process.cwd();
  if (!isGitRepo(resolvedRepoPath)) {
    return null;
  }

  return getScopedLockfilePath(resolvedRepoPath);
};

const sleep = (ms: number): void => {
  Atomics.wait(sleepBuffer, 0, 0, ms);
};

const isSpotlightState = (value: unknown): value is SpotlightState => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const state = value as Record<string, unknown>;
  return (
    state.schemaVersion === LOCKFILE_SCHEMA_VERSION &&
    (typeof state.lastSyncAt === "string" || state.lastSyncAt === null) &&
    typeof state.pid === "number" &&
    typeof state.startedAt === "string" &&
    typeof state.targetCheckpointId === "string" &&
    typeof state.targetPath === "string" &&
    typeof state.targetRestoreLabel === "string" &&
    typeof state.watchBackend === "string" &&
    typeof state.workspaceCheckpointCommit === "string" &&
    typeof state.workspaceCheckpointId === "string" &&
    typeof state.worktreeBranch === "string" &&
    typeof state.worktreePath === "string"
  );
};

const removeLockfileAtPath = (lockfilePath: string): void => {
  try {
    unlinkSync(lockfilePath);
  } catch {
    // ignore
  }
};

const isProcessRunning = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const readLockfileAtPath = (lockfilePath: string): SpotlightState | null => {
  if (!existsSync(lockfilePath)) {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(readFileSync(lockfilePath, "utf8"));
  } catch {
    throw new Error(
      `Incompatible spotlight lockfile at ${lockfilePath}. Remove it and start again.`,
    );
  }

  if (!isSpotlightState(parsed)) {
    throw new Error(
      `Incompatible spotlight lockfile at ${lockfilePath}. Remove it and start again.`,
    );
  }

  return parsed;
};

const readActiveLockfileAtPath = (lockfilePath: string): SpotlightState | null => {
  const state = readLockfileAtPath(lockfilePath);

  if (!state) {
    return null;
  }

  if (isProcessRunning(state.pid)) {
    return state;
  }

  removeLockfileAtPath(lockfilePath);
  return null;
};

const listScopedLockfiles = (): string[] => {
  if (!existsSync(DEFAULT_LOCKFILE_DIR)) {
    return [];
  }

  return readdirSync(DEFAULT_LOCKFILE_DIR)
    .filter((entry) => entry.startsWith(SCOPED_LOCKFILE_PREFIX) && entry.endsWith(".lock"))
    .map((entry) => join(DEFAULT_LOCKFILE_DIR, entry));
};

export const readLockfile = (repoPath?: string): SpotlightState | null => {
  const lockfilePath = getCurrentLockfilePath(repoPath);

  if (!lockfilePath) {
    return null;
  }

  return readLockfileAtPath(lockfilePath);
};

export const listActiveLockfiles = (): SpotlightState[] => {
  const explicitLockfile = process.env.SPOTLIGHT_LOCKFILE;
  const lockfilePaths = explicitLockfile ? [explicitLockfile] : listScopedLockfiles();

  const activeStates: SpotlightState[] = [];

  for (const lockfilePath of lockfilePaths) {
    const state = readActiveLockfileAtPath(lockfilePath);

    if (state) {
      activeStates.push(state);
    }
  }

  return activeStates;
};

export const isLocked = (repoPath?: string): boolean => {
  const lockfilePath = getCurrentLockfilePath(repoPath);

  if (!lockfilePath) {
    return false;
  }

  return readActiveLockfileAtPath(lockfilePath) !== null;
};

export const writeLockfile = (state: SpotlightState, repoPath = state.targetPath): void => {
  const lockfilePath = getCurrentLockfilePath(repoPath);

  if (!lockfilePath) {
    throw new Error("Could not determine a spotlight lockfile path.");
  }

  mkdirSync(dirname(lockfilePath), { recursive: true });
  writeFileSync(lockfilePath, JSON.stringify(state, null, 2));
};

export const removeLockfile = (repoPath?: string): void => {
  const lockfilePath = getCurrentLockfilePath(repoPath);

  if (!lockfilePath) {
    return;
  }

  removeLockfileAtPath(lockfilePath);
};

export const waitForLockfileRelease = (
  expectedPid: number,
  repoPath?: string,
  timeoutMs = 10_000,
): void => {
  const lockfilePath = getCurrentLockfilePath(repoPath);

  if (!lockfilePath) {
    return;
  }

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const active = readActiveLockfileAtPath(lockfilePath);

    if (!active || active.pid !== expectedPid) {
      return;
    }

    sleep(LOCKFILE_WAIT_POLL_MS);
  }

  const active = readActiveLockfileAtPath(lockfilePath);
  throw new Error(
    `Timed out waiting for spotlight to stop${active ? ` (PID ${active.pid}, syncing ${active.worktreePath})` : ""}.`,
  );
};
