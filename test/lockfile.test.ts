import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { createTempDir, cleanupTempDir } from "./helpers/git-fixtures.js";
import { isLocked, readLockfile, removeLockfile, writeLockfile } from "../src/lockfile.js";
import type { SpotlightState } from "../src/types.js";

describe("lockfile", () => {
  test("reads and writes from an injected lockfile path", () => {
    const dir = createTempDir();
    const lockfilePath = join(dir, "spotlight.lock");
    const originalLockfileEnv = process.env.SPOTLIGHT_LOCKFILE;
    process.env.SPOTLIGHT_LOCKFILE = lockfilePath;

    try {
      const state: SpotlightState = {
        isDetached: false,
        lastCheckpointSha: null,
        originalBranch: "main",
        originalHead: "0123456789abcdef0123456789abcdef01234567",
        pid: process.pid,
        protect: [],
        startedAt: new Date().toISOString(),
        stashName: null,
        targetPath: "/tmp/target",
        worktreeBranch: "feature",
        worktreePath: "/tmp/worktree",
      };

      writeLockfile(state);
      expect(existsSync(lockfilePath)).toBe(true);
      expect(readLockfile()).toEqual(state);
      expect(readFileSync(lockfilePath, "utf8")).toContain('"originalHead"');

      removeLockfile();
      expect(existsSync(lockfilePath)).toBe(false);
    } finally {
      if (originalLockfileEnv === undefined) {
        delete process.env.SPOTLIGHT_LOCKFILE;
      } else {
        process.env.SPOTLIGHT_LOCKFILE = originalLockfileEnv;
      }
      cleanupTempDir(dir);
    }
  });

  test("removes stale lockfiles when the process is gone", () => {
    const dir = createTempDir();
    const lockfilePath = join(dir, "spotlight.lock");
    const originalLockfileEnv = process.env.SPOTLIGHT_LOCKFILE;
    process.env.SPOTLIGHT_LOCKFILE = lockfilePath;

    try {
      writeFileSync(lockfilePath, JSON.stringify({ pid: 999_999 }, null, 2), "utf8");
      expect(isLocked()).toBe(false);
      expect(existsSync(lockfilePath)).toBe(false);
    } finally {
      if (originalLockfileEnv === undefined) {
        delete process.env.SPOTLIGHT_LOCKFILE;
      } else {
        process.env.SPOTLIGHT_LOCKFILE = originalLockfileEnv;
      }
      cleanupTempDir(dir);
    }
  });
});
