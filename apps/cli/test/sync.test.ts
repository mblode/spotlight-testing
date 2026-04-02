import { mkdirSync, writeFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { getCheckpointCommit, restoreCheckpoint, saveCheckpoint } from "../src/checkpointer.js";
import { getGitBranch, getGitRoot, getHeadLabel, isSameRepo } from "../src/git.js";
import { readLockfile, removeLockfile, writeLockfile } from "../src/lockfile.js";
import { restore, syncOnce } from "../src/spotlight.js";
import type { SpotlightState } from "../src/types.js";
import {
  cleanupTempDir,
  createRepoFixture,
  createRepoFixtureWithoutWorktree,
  execGit,
  getCheckpointNamespaceRefs,
  readCachedDiffNames,
  readGitPath,
  readTextFile,
  readTextFileIfExists,
  writeTextFile,
} from "./helpers/git-fixtures.js";

const buildState = (
  fixture: ReturnType<typeof createRepoFixture>,
  targetCheckpointId: string,
  workspaceCheckpointId: string,
  targetRestoreLabel: string,
): SpotlightState => ({
  lastSyncAt: new Date().toISOString(),
  pid: process.pid,
  schemaVersion: 2,
  startedAt: new Date().toISOString(),
  targetCheckpointId,
  targetPath: getGitRoot(fixture.root),
  targetRestoreLabel,
  watchBackend: "fs.watch(serialized)",
  workspaceCheckpointCommit: getCheckpointCommit(fixture.root, workspaceCheckpointId),
  workspaceCheckpointId,
  worktreeBranch: "feature",
  worktreePath: getGitRoot(fixture.worktree),
});

describe("sync and restore", { timeout: 15_000 }, () => {
  test("syncOnce syncs worktree changes into the target and leaves ignored files untouched", () => {
    const fixture = createRepoFixture({
      ".gitignore": "ignored.log\n",
      "app.txt": "initial\n",
    });

    try {
      writeTextFile(fixture.root, "ignored.log", "keep-me\n");
      writeTextFile(fixture.worktree, "app.txt", "updated\n");
      writeTextFile(fixture.worktree, "notes.txt", "new-file\n");

      const result = syncOnce(fixture.worktree, fixture.root);

      expect(result.checkpointId).toMatch(/^cp-sync-workspace-/);
      expect(result.changedPaths).toEqual(["app.txt", "notes.txt"]);
      expect(getGitBranch(fixture.root)).toBe("main");
      expect(execGit(fixture.root, ["rev-parse", "HEAD"])).toBe(
        execGit(fixture.worktree, ["rev-parse", "HEAD"]),
      );
      expect(readTextFile(fixture.root, "app.txt")).toBe("updated");
      expect(readTextFile(fixture.root, "notes.txt")).toBe("new-file");
      expect(readTextFile(fixture.root, "ignored.log")).toBe("keep-me");
      expect(getCheckpointNamespaceRefs(fixture.root)).toEqual([]);
    } finally {
      cleanupTempDir(fixture.parent);
    }
  });

  test("syncOnce resolves nested worktree and target paths to the repo roots", () => {
    const fixture = createRepoFixture({
      "nested/view.txt": "before\n",
      "root.txt": "before-root\n",
    });

    try {
      writeTextFile(fixture.worktree, "nested/view.txt", "after\n");
      writeTextFile(fixture.worktree, "root.txt", "after-root\n");

      syncOnce(`${fixture.worktree}/nested`, `${fixture.root}/nested`);

      expect(readTextFile(fixture.root, "nested/view.txt")).toBe("after");
      expect(readTextFile(fixture.root, "root.txt")).toBe("after-root");
    } finally {
      cleanupTempDir(fixture.parent);
    }
  });

  test("restore replays the target-start checkpoint and brings back dirty target state", () => {
    const fixture = createRepoFixture({
      "app.txt": "initial\n",
      "staged.txt": "before-stage\n",
    });

    try {
      writeTextFile(fixture.root, "app.txt", "target-local\n");
      writeTextFile(fixture.root, "scratch.txt", "scratch\n");
      writeTextFile(fixture.root, "staged.txt", "after-stage\n");
      execGit(fixture.root, ["add", "staged.txt"]);

      const targetCheckpointId = "cp-target-restore-test";
      const workspaceCheckpointId = "cp-workspace-test";
      const targetRestoreLabel = getHeadLabel(fixture.root);

      saveCheckpoint(fixture.root, { id: targetCheckpointId });
      writeTextFile(fixture.worktree, "app.txt", "updated-from-worktree\n");
      writeTextFile(fixture.worktree, "nested/new.txt", "new\n");
      saveCheckpoint(fixture.worktree, { force: true, id: workspaceCheckpointId });
      restoreCheckpoint(fixture.root, workspaceCheckpointId);

      const state = buildState(
        fixture,
        targetCheckpointId,
        workspaceCheckpointId,
        targetRestoreLabel,
      );
      writeLockfile(state, fixture.root);
      expect(readLockfile(fixture.root)).not.toBeNull();

      restore(fixture.root);

      expect(getGitBranch(fixture.root)).toBe("main");
      expect(readTextFile(fixture.root, "app.txt")).toBe("target-local");
      expect(readTextFile(fixture.root, "scratch.txt")).toBe("scratch");
      expect(readTextFile(fixture.root, "staged.txt")).toBe("after-stage");
      expect(readCachedDiffNames(fixture.root)).toEqual(["staged.txt"]);
      expect(readTextFileIfExists(fixture.root, "nested/new.txt")).toBeNull();
      expect(getCheckpointNamespaceRefs(fixture.root)).toEqual([]);
      expect(readLockfile(fixture.root)).toBeNull();
    } finally {
      removeLockfile(fixture.root);
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

  test("blocks sync when a merge is in progress", () => {
    const fixture = createRepoFixture({
      "app.txt": "initial\n",
    });

    try {
      writeFileSync(
        readGitPath(fixture.worktree, "MERGE_HEAD"),
        `${execGit(fixture.worktree, ["rev-parse", "HEAD"])}\n`,
        "utf8",
      );

      expect(() => syncOnce(fixture.worktree, fixture.root)).toThrow(/merge is in progress/);
    } finally {
      cleanupTempDir(fixture.parent);
    }
  });

  test("blocks sync when a cherry-pick is in progress", () => {
    const fixture = createRepoFixture({
      "app.txt": "initial\n",
    });

    try {
      writeFileSync(
        readGitPath(fixture.worktree, "CHERRY_PICK_HEAD"),
        `${execGit(fixture.worktree, ["rev-parse", "HEAD"])}\n`,
        "utf8",
      );

      expect(() => syncOnce(fixture.worktree, fixture.root)).toThrow(/cherry-pick is in progress/);
    } finally {
      cleanupTempDir(fixture.parent);
    }
  });

  test("blocks sync when a revert is in progress", () => {
    const fixture = createRepoFixture({
      "app.txt": "initial\n",
    });

    try {
      writeFileSync(
        readGitPath(fixture.worktree, "REVERT_HEAD"),
        `${execGit(fixture.worktree, ["rev-parse", "HEAD"])}\n`,
        "utf8",
      );

      expect(() => syncOnce(fixture.worktree, fixture.root)).toThrow(/revert is in progress/);
    } finally {
      cleanupTempDir(fixture.parent);
    }
  });

  test("blocks sync when a rebase is in progress", () => {
    const fixture = createRepoFixture({
      "app.txt": "initial\n",
    });

    try {
      mkdirSync(readGitPath(fixture.worktree, "rebase-merge"), { recursive: true });
      expect(() => syncOnce(fixture.worktree, fixture.root)).toThrow(/rebase is in progress/);
    } finally {
      cleanupTempDir(fixture.parent);
    }
  });
});
