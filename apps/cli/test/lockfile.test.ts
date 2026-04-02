import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { cleanupTempDir, createRepoFixture, createTempDir } from "./helpers/git-fixtures.js";
import { isLocked, readLockfile, removeLockfile, writeLockfile } from "../src/lockfile.js";
import type { SpotlightState } from "../src/types.js";

const buildState = (
  targetPath: string,
  worktreePath: string,
  pid = process.pid,
): SpotlightState => ({
  lastSyncAt: new Date().toISOString(),
  pid,
  schemaVersion: 2,
  startedAt: new Date().toISOString(),
  targetCheckpointId: "cp-target-restore-1",
  targetPath,
  targetRestoreLabel: "main",
  watchBackend: "fs.watch(serialized)",
  workspaceCheckpointCommit: "0123456789abcdef0123456789abcdef01234567",
  workspaceCheckpointId: "cp-spotlight-1",
  worktreeBranch: "feature",
  worktreePath,
});

describe("lockfile", () => {
  test("reads and writes from an injected lockfile path", () => {
    const dir = createTempDir();
    const lockfilePath = join(dir, "spotlight.lock");
    const originalLockfileEnv = process.env.SPOTLIGHT_LOCKFILE;
    process.env.SPOTLIGHT_LOCKFILE = lockfilePath;

    try {
      const state: SpotlightState = {
        lastSyncAt: new Date().toISOString(),
        pid: process.pid,
        schemaVersion: 2,
        startedAt: new Date().toISOString(),
        targetCheckpointId: "cp-target-restore-1",
        targetPath: "/tmp/target",
        targetRestoreLabel: "main",
        watchBackend: "fs.watch(serialized)",
        workspaceCheckpointCommit: "0123456789abcdef0123456789abcdef01234567",
        workspaceCheckpointId: "cp-spotlight-1",
        worktreeBranch: "feature",
        worktreePath: "/tmp/worktree",
      };

      writeLockfile(state);
      expect(existsSync(lockfilePath)).toBe(true);
      expect(readLockfile()).toEqual(state);
      expect(readFileSync(lockfilePath, "utf8")).toContain('"targetCheckpointId"');

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

  test("rejects incompatible lockfiles", () => {
    const dir = createTempDir();
    const lockfilePath = join(dir, "spotlight.lock");
    const originalLockfileEnv = process.env.SPOTLIGHT_LOCKFILE;
    process.env.SPOTLIGHT_LOCKFILE = lockfilePath;

    try {
      writeFileSync(lockfilePath, JSON.stringify({ pid: process.pid }, null, 2), "utf8");
      expect(() => readLockfile()).toThrow(/Incompatible spotlight lockfile/);
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
      const staleState: SpotlightState = {
        lastSyncAt: new Date().toISOString(),
        pid: 999_999,
        schemaVersion: 2,
        startedAt: new Date().toISOString(),
        targetCheckpointId: "cp-target-restore-1",
        targetPath: "/tmp/target",
        targetRestoreLabel: "main",
        watchBackend: "fs.watch(serialized)",
        workspaceCheckpointCommit: "0123456789abcdef0123456789abcdef01234567",
        workspaceCheckpointId: "cp-spotlight-1",
        worktreeBranch: "feature",
        worktreePath: "/tmp/worktree",
      };
      writeFileSync(lockfilePath, JSON.stringify(staleState, null, 2), "utf8");
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

  test("keeps separate default lockfiles for different repos", () => {
    const originalLockfileEnv = process.env.SPOTLIGHT_LOCKFILE;
    delete process.env.SPOTLIGHT_LOCKFILE;

    const firstFixture = createRepoFixture();
    const secondFixture = createRepoFixture();

    try {
      const firstState = buildState(firstFixture.root, firstFixture.worktree);
      const secondState = buildState(secondFixture.root, secondFixture.worktree);

      writeLockfile(firstState, firstFixture.root);
      writeLockfile(secondState, secondFixture.root);

      expect(readLockfile(firstFixture.root)).toEqual(firstState);
      expect(readLockfile(secondFixture.root)).toEqual(secondState);

      removeLockfile(firstFixture.root);
      expect(readLockfile(firstFixture.root)).toBeNull();
      expect(readLockfile(secondFixture.root)).toEqual(secondState);
    } finally {
      if (originalLockfileEnv === undefined) {
        delete process.env.SPOTLIGHT_LOCKFILE;
      } else {
        process.env.SPOTLIGHT_LOCKFILE = originalLockfileEnv;
      }
      removeLockfile(firstFixture.root);
      removeLockfile(secondFixture.root);
      cleanupTempDir(firstFixture.parent);
      cleanupTempDir(secondFixture.parent);
    }
  });
});
