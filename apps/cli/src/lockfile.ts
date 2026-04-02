import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { SpotlightState } from "./types.js";

const DEFAULT_LOCKFILE = join(tmpdir(), "spotlight.lock");
const LOCKFILE_SCHEMA_VERSION = 2;
const LOCKFILE_WAIT_POLL_MS = 50;
const sleepBuffer = new Int32Array(new SharedArrayBuffer(4));
const getCurrentLockfilePath = (): string => process.env.SPOTLIGHT_LOCKFILE ?? DEFAULT_LOCKFILE;

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

export const readLockfile = (): SpotlightState | null => {
  const lockfilePath = getCurrentLockfilePath();

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

export const isLocked = (): boolean => {
  const lockfilePath = getCurrentLockfilePath();

  if (!existsSync(lockfilePath)) {
    return false;
  }

  const state = readLockfile();
  if (!state) {
    return false;
  }

  try {
    process.kill(state.pid, 0);
    return true;
  } catch {
    unlinkSync(lockfilePath);
    return false;
  }
};

export const writeLockfile = (state: SpotlightState): void => {
  writeFileSync(getCurrentLockfilePath(), JSON.stringify(state, null, 2));
};

export const removeLockfile = (): void => {
  try {
    unlinkSync(getCurrentLockfilePath());
  } catch {
    // ignore
  }
};

export const waitForLockfileRelease = (expectedPid: number, timeoutMs = 10_000): void => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (!isLocked()) {
      return;
    }

    const active = readLockfile();
    if (!active || active.pid !== expectedPid) {
      return;
    }

    sleep(LOCKFILE_WAIT_POLL_MS);
  }

  const active = readLockfile();
  throw new Error(
    `Timed out waiting for spotlight to stop${active ? ` (PID ${active.pid}, syncing ${active.worktreePath})` : ""}.`,
  );
};
