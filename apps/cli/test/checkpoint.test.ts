import { describe, expect, test } from "vitest";

import {
  getCheckpointCommit,
  readCheckpointMetadata,
  saveCheckpoint,
} from "../src/checkpointer.js";
import {
  cleanupTempDir,
  createRepoFixture,
  getCheckpointNamespaceRefs,
  readGitTree,
  writeTextFile,
} from "./helpers/git-fixtures.js";

describe("checkpoint refs", () => {
  test("captures tracked and untracked files while honoring .gitignore", () => {
    const fixture = createRepoFixture({
      ".gitignore": "ignored.log\n",
      "a.txt": "alpha\n",
    });

    try {
      writeTextFile(fixture.worktree, "a.txt", "alpha-updated\n");
      writeTextFile(fixture.worktree, "untracked.txt", "scratch\n");
      writeTextFile(fixture.worktree, "ignored.log", "ignored\n");

      const checkpointId = "cp-test-save";
      expect(saveCheckpoint(fixture.worktree, { id: checkpointId })).toBe(checkpointId);

      const checkpointRef = `refs/conductor-checkpoints/${checkpointId}`;
      expect(getCheckpointNamespaceRefs(fixture.root)).toContain(checkpointRef);
      expect(readGitTree(fixture.root, checkpointRef)).toEqual([
        ".gitignore",
        "a.txt",
        "untracked.txt",
      ]);

      const metadata = readCheckpointMetadata(fixture.root, checkpointRef);
      expect(metadata.id).toBe(checkpointId);
      expect(metadata.commit).toBe(getCheckpointCommit(fixture.root, checkpointId));
      expect(metadata.head).toMatch(/^[0-9a-f]{40}$/);
      expect(metadata.indexTree).toMatch(/^[0-9a-f]{40}$/);
      expect(metadata.worktreeTree).toMatch(/^[0-9a-f]{40}$/);
      expect(metadata.created).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    } finally {
      cleanupTempDir(fixture.parent);
    }
  });

  test("force-updates an existing checkpoint ref", () => {
    const fixture = createRepoFixture({
      "a.txt": "alpha\n",
    });

    try {
      const checkpointId = "cp-test-force";
      saveCheckpoint(fixture.worktree, { id: checkpointId });
      const firstCommit = getCheckpointCommit(fixture.worktree, checkpointId);

      writeTextFile(fixture.worktree, "a.txt", "alpha-updated\n");
      saveCheckpoint(fixture.worktree, { force: true, id: checkpointId });
      const secondCommit = getCheckpointCommit(fixture.worktree, checkpointId);

      expect(secondCommit).not.toBe(firstCommit);
      expect(readCheckpointMetadata(fixture.root, secondCommit).id).toBe(checkpointId);
      expect(readGitTree(fixture.root, secondCommit)).toEqual(["a.txt"]);
    } finally {
      cleanupTempDir(fixture.parent);
    }
  });
});
