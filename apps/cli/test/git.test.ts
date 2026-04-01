import { mkdirSync, realpathSync, writeFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import {
  cleanupTempDir,
  createRepoFixture,
  createRepoFixtureWithoutWorktree,
  execGit,
} from "./helpers/git-fixtures.js";
import {
  checkoutDetached,
  getGitBranch,
  getGitCommonDir,
  getHeadState,
  getMainWorktreeRoot,
  gitPath,
  isMergeInProgress,
  isRebaseInProgress,
  isSameRepo,
  stash,
  stashPop,
} from "../src/git.js";

describe("git helpers", () => {
  test("compares linked worktrees by shared common dir", () => {
    const fixture = createRepoFixture();
    const unrelatedRoot = createRepoFixtureWithoutWorktree();

    try {
      expect(getGitCommonDir(fixture.root)).toBe(getGitCommonDir(fixture.worktree));
      expect(isSameRepo(fixture.root, fixture.worktree)).toBe(true);
      expect(isSameRepo(fixture.root, unrelatedRoot.root)).toBe(false);
    } finally {
      cleanupTempDir(fixture.parent);
      cleanupTempDir(unrelatedRoot.parent);
    }
  });

  test("finds the primary checkout for a linked worktree", () => {
    const fixture = createRepoFixture();

    try {
      expect(getMainWorktreeRoot(fixture.worktree)).toBe(realpathSync(fixture.root));
      expect(getMainWorktreeRoot(fixture.root)).toBeNull();
    } finally {
      cleanupTempDir(fixture.parent);
    }
  });

  test("detects branch and detached head state", () => {
    const fixture = createRepoFixture();

    try {
      const branchState = getHeadState(fixture.worktree);
      expect(branchState.originalBranch).toBe("feature");
      expect(branchState.isDetached).toBe(false);
      expect(branchState.originalHead).toMatch(/^[0-9a-f]{40}$/);
      expect(getGitBranch(fixture.worktree)).toBe("feature");

      checkoutDetached(fixture.worktree, branchState.originalHead, true);

      const detachedState = getHeadState(fixture.worktree);
      expect(detachedState.originalBranch).toBeNull();
      expect(detachedState.isDetached).toBe(true);
      expect(getGitBranch(fixture.worktree)).toBe("HEAD");
    } finally {
      cleanupTempDir(fixture.parent);
    }
  });

  test("detects merge and rebase state via git paths", () => {
    const fixture = createRepoFixture();

    try {
      const rebaseDir = gitPath(fixture.root, "rebase-merge");
      mkdirSync(rebaseDir, { recursive: true });
      expect(isRebaseInProgress(fixture.root)).toBe(true);

      const mergeHead = gitPath(fixture.root, "MERGE_HEAD");
      writeFileSync(mergeHead, `${execGit(fixture.root, ["rev-parse", "HEAD"])}\n`, "utf8");
      expect(isMergeInProgress(fixture.root)).toBe(true);
    } finally {
      cleanupTempDir(fixture.parent);
    }
  });

  test("stashes and restores untracked files", () => {
    const fixture = createRepoFixture();
    const scratchPath = `${fixture.root}/scratch.txt`;

    try {
      writeFileSync(scratchPath, "local\n", "utf8");

      const stashName = stash(fixture.root);
      expect(stashName).toMatch(/^spotlight-auto-/);
      expect(getGitBranch(fixture.root)).toBe("main");
      expect(stashPop(fixture.root, stashName ?? "")).toBe(true);
      expect(execGit(fixture.root, ["status", "--porcelain"])).toContain("scratch.txt");
    } finally {
      cleanupTempDir(fixture.parent);
    }
  });
});
