import { rmSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { createCheckpoint } from "../src/checkpoint.js";
import {
  cleanupTempDir,
  createRepoFixture,
  execGit,
  writeTextFile,
} from "./helpers/git-fixtures.js";

describe("checkpoint creation", () => {
  test("captures tracked edits and deletions from HEAD", () => {
    const fixture = createRepoFixture({
      "a.txt": "alpha\n",
      "b.txt": "beta\n",
    });

    try {
      writeTextFile(fixture.worktree, "a.txt", "alpha-updated\n");
      rmSync(join(fixture.worktree, "b.txt"));
      writeTextFile(fixture.worktree, "c.txt", "untracked\n");

      const checkpoint = createCheckpoint(fixture.worktree);
      const names = execGit(fixture.root, ["ls-tree", "-r", "--name-only", checkpoint])
        .split("\n")
        .filter(Boolean);

      expect(names).toEqual(["a.txt"]);
      expect(execGit(fixture.root, ["show", `${checkpoint}:a.txt`])).toBe("alpha-updated");
    } finally {
      cleanupTempDir(fixture.parent);
    }
  });

  test("includes untracked files when opted in and excludes protected files", () => {
    const fixture = createRepoFixture({
      "a.txt": "alpha\n",
    });

    try {
      writeTextFile(fixture.worktree, "a.txt", "alpha-updated\n");
      writeTextFile(fixture.worktree, "c.txt", "untracked\n");
      writeTextFile(fixture.worktree, ".env", "secret\n");
      writeTextFile(fixture.worktree, "nested/.env.local", "nested-secret\n");

      const checkpoint = createCheckpoint(fixture.worktree, { includeUntracked: true });
      const names = execGit(fixture.root, ["ls-tree", "-r", "--name-only", checkpoint])
        .split("\n")
        .filter(Boolean);

      expect(names).toContain("a.txt");
      expect(names).toContain("c.txt");
      expect(names).not.toContain(".env");
      expect(names).not.toContain("nested/.env.local");
    } finally {
      cleanupTempDir(fixture.parent);
    }
  });

  test("reuses the baseline ref when the checkpoint tree is unchanged", () => {
    const fixture = createRepoFixture({
      "a.txt": "alpha\n",
    });

    try {
      writeTextFile(fixture.worktree, "a.txt", "alpha-updated\n");

      const initialCheckpoint = createCheckpoint(fixture.worktree);
      const repeatedCheckpoint = createCheckpoint(fixture.worktree, {
        baselineRef: initialCheckpoint,
      });

      expect(repeatedCheckpoint).toBe(initialCheckpoint);
    } finally {
      cleanupTempDir(fixture.parent);
    }
  });
});
