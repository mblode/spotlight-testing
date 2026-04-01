import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { restore, syncOnce } from "../src/spotlight.js";
import { getHeadState, getGitBranch, gitPath, isSameRepo, stash } from "../src/git.js";
import { readLockfile, writeLockfile, removeLockfile } from "../src/lockfile.js";
import { parkProtectedFiles, restoreProtectedFiles } from "../src/sync.js";
import {
  cleanupTempDir,
  createRepoFixture,
  createRepoFixtureWithoutWorktree,
  readTextFile,
  writeTextFile,
} from "./helpers/git-fixtures.js";

describe("protected parking and restore", () => {
  test("parks protected files while running a callback", () => {
    const root = createRepoFixtureWithoutWorktree({
      "app.txt": "initial\n",
    });

    try {
      writeTextFile(root.root, ".env", "secret\n");
      writeTextFile(root.root, "nested/.env.local", "nested-secret\n");

      const parked = parkProtectedFiles(root.root, []);

      try {
        expect(existsSync(join(root.root, ".env"))).toBe(false);
        expect(existsSync(join(root.root, "nested/.env.local"))).toBe(false);
        expect(readTextFile(root.root, "app.txt")).toBe("initial");
      } finally {
        restoreProtectedFiles(root.root, parked);
      }

      expect(readTextFile(root.root, ".env")).toBe("secret");
      expect(readTextFile(root.root, "nested/.env.local")).toBe("nested-secret");
    } finally {
      cleanupTempDir(root.parent);
    }
  });

  test("syncOnce checkpoints worktree changes and preserves protected files", () => {
    const fixture = createRepoFixture({
      "app.txt": "initial\n",
    });

    try {
      writeTextFile(fixture.root, ".env", "target-secret\n");
      writeTextFile(fixture.worktree, "app.txt", "updated\n");

      const result = syncOnce(fixture.worktree, fixture.root);

      expect(result.synced).toBeGreaterThan(0);
      expect(result.changedPaths).toContain("app.txt");
      expect(getGitBranch(fixture.root)).toBe("HEAD");
      expect(readTextFile(fixture.root, "app.txt")).toBe("updated");
      expect(readTextFile(fixture.root, ".env")).toBe("target-secret");
    } finally {
      cleanupTempDir(fixture.parent);
    }
  });

  test("restore returns the target to its original branch and keeps protected files", () => {
    const fixture = createRepoFixture({
      "app.txt": "initial\n",
    });

    try {
      const original = getHeadState(fixture.root);
      writeTextFile(fixture.root, ".env", "target-secret\n");
      writeTextFile(fixture.worktree, "app.txt", "updated\n");

      const checkpoint = syncOnce(fixture.worktree, fixture.root);
      const state = {
        ...original,
        lastCheckpointSha: checkpoint.commitSha,
        pid: process.pid,
        protect: [],
        startedAt: new Date().toISOString(),
        stashName: null,
        targetPath: fixture.root,
        worktreeBranch: "feature",
        worktreePath: fixture.worktree,
      };

      writeLockfile(state);
      expect(readLockfile()).not.toBeNull();

      restore(fixture.root);

      expect(getGitBranch(fixture.root)).toBe("main");
      expect(readTextFile(fixture.root, ".env")).toBe("target-secret");
      expect(readTextFile(fixture.root, "app.txt")).toBe("initial");
    } finally {
      removeLockfile();
      cleanupTempDir(fixture.parent);
    }
  });

  test("restore reapplies target changes that were auto-stashed during spotlight startup", () => {
    const fixture = createRepoFixture({
      "app.txt": "initial\n",
    });

    try {
      const original = getHeadState(fixture.root);
      writeTextFile(fixture.root, "app.txt", "target-local\n");
      writeTextFile(fixture.root, "scratch.txt", "scratch\n");
      const stashName = stash(fixture.root);

      expect(stashName).toMatch(/^spotlight-auto-/);

      writeTextFile(fixture.worktree, "app.txt", "updated-from-worktree\n");

      const checkpoint = syncOnce(fixture.worktree, fixture.root);
      const state = {
        ...original,
        lastCheckpointSha: checkpoint.commitSha,
        pid: process.pid,
        protect: [],
        startedAt: new Date().toISOString(),
        stashName,
        targetPath: fixture.root,
        worktreeBranch: "feature",
        worktreePath: fixture.worktree,
      };

      writeLockfile(state);
      restore(fixture.root);

      expect(getGitBranch(fixture.root)).toBe("main");
      expect(readTextFile(fixture.root, "app.txt")).toBe("target-local");
      expect(readTextFile(fixture.root, "scratch.txt")).toBe("scratch");
    } finally {
      removeLockfile();
      cleanupTempDir(fixture.parent);
    }
  });

  test("rejects unrelated repositories", () => {
    const fixture = createRepoFixture({
      "app.txt": "initial\n",
    });
    const unrelated = createRepoFixtureWithoutWorktree({
      "app.txt": "other\n",
    });

    try {
      expect(isSameRepo(fixture.worktree, unrelated.root)).toBe(false);
      expect(() => syncOnce(fixture.worktree, unrelated.root)).toThrow(
        /must share the same git object database/,
      );
    } finally {
      cleanupTempDir(fixture.parent);
      cleanupTempDir(unrelated.parent);
    }
  });

  test("blocks sync when a rebase is in progress", () => {
    const fixture = createRepoFixture({
      "app.txt": "initial\n",
    });

    try {
      const markerDir = gitPath(fixture.worktree, "rebase-merge");
      mkdirSync(markerDir, { recursive: true });

      expect(() => syncOnce(fixture.worktree, fixture.root)).toThrow(/rebase or merge in progress/);
    } finally {
      cleanupTempDir(fixture.parent);
    }
  });
});
