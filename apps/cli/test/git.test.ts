import { mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import {
  cleanupTempDir,
  createRepoFixture,
  createRepoFixtureWithoutWorktree,
  execGit,
  readGitCommonDir,
  readGitPath,
} from "./helpers/git-fixtures.js";
import {
  getGitBranch,
  getGitBusyState,
  getHeadLabel,
  getMainWorktreeRoot,
  isSameRepo,
} from "../src/git.js";

describe("git helpers", () => {
  test("compares linked worktrees by shared common dir", () => {
    const fixture = createRepoFixture();
    const unrelatedRoot = createRepoFixtureWithoutWorktree();

    try {
      expect(readGitCommonDir(fixture.root)).toBe(readGitCommonDir(fixture.worktree));
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

  test("reports branch labels for attached and detached HEAD states", () => {
    const fixture = createRepoFixture();

    try {
      expect(getGitBranch(fixture.worktree)).toBe("feature");
      expect(getHeadLabel(fixture.worktree)).toBe("feature");

      execGit(fixture.worktree, ["checkout", "--detach", "HEAD"]);

      expect(getGitBranch(fixture.worktree)).toBe("HEAD");
      expect(getHeadLabel(fixture.worktree)).toMatch(/\(detached\)$/);
    } finally {
      cleanupTempDir(fixture.parent);
    }
  });

  test("detects busy repo states from git markers", () => {
    const fixture = createRepoFixture();

    try {
      const rebaseDir = readGitPath(fixture.root, "rebase-merge");
      const mergeHead = readGitPath(fixture.root, "MERGE_HEAD");
      const cherryPickHead = readGitPath(fixture.root, "CHERRY_PICK_HEAD");
      const revertHead = readGitPath(fixture.root, "REVERT_HEAD");

      mkdirSync(rebaseDir, { recursive: true });
      expect(getGitBusyState(fixture.root)).toBe("busy:rebase");

      rmSync(rebaseDir, { force: true, recursive: true });
      writeFileSync(mergeHead, `${execGit(fixture.root, ["rev-parse", "HEAD"])}\n`, "utf8");
      expect(getGitBusyState(fixture.root)).toBe("busy:merge");

      rmSync(mergeHead, { force: true });
      writeFileSync(cherryPickHead, `${execGit(fixture.root, ["rev-parse", "HEAD"])}\n`, "utf8");
      expect(getGitBusyState(fixture.root)).toBe("busy:cherry-pick");

      rmSync(cherryPickHead, { force: true });
      writeFileSync(revertHead, `${execGit(fixture.root, ["rev-parse", "HEAD"])}\n`, "utf8");
      expect(getGitBusyState(fixture.root)).toBe("busy:revert");
    } finally {
      cleanupTempDir(fixture.parent);
    }
  });
});
