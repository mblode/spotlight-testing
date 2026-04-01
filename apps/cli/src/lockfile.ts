import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { SpotlightState } from "./types.js";

const DEFAULT_LOCKFILE = join(tmpdir(), "spotlight.lock");
const getCurrentLockfilePath = (): string => process.env.SPOTLIGHT_LOCKFILE ?? DEFAULT_LOCKFILE;

export const readLockfile = (): SpotlightState | null => {
  try {
    const content = readFileSync(getCurrentLockfilePath(), "utf8");
    return JSON.parse(content);
  } catch {
    return null;
  }
};

export const isLocked = (): boolean => {
  const lockfilePath = getCurrentLockfilePath();

  if (!existsSync(lockfilePath)) {
    return false;
  }

  try {
    const state = readLockfile();
    if (!state) {
      return false;
    }

    // Check if the process is still running
    try {
      process.kill(state.pid, 0);
      return true;
    } catch {
      // Process is dead, clean up stale lockfile
      unlinkSync(lockfilePath);
      return false;
    }
  } catch {
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

export const getLockfilePath = (): string => getCurrentLockfilePath();
