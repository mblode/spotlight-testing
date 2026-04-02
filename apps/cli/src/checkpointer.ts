import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { CheckpointMetadata, CheckpointSaveOptions } from "./types.js";
import {
  deleteGitRef,
  getChangedFiles,
  getGitBusyState,
  gitWithEnv,
  readCommitObject,
  revParse,
  runGit,
  tryRevParse,
} from "./git.js";

const ZERO_OID = "0000000000000000000000000000000000000000";
const CHECKPOINT_AUTHOR_ENV = {
  GIT_AUTHOR_DATE: "",
  GIT_AUTHOR_EMAIL: "checkpointer@noreply",
  GIT_AUTHOR_NAME: "Checkpointer",
  GIT_COMMITTER_DATE: "",
  GIT_COMMITTER_EMAIL: "checkpointer@noreply",
  GIT_COMMITTER_NAME: "Checkpointer",
};

const getCheckpointerRef = (id: string): string => `refs/conductor-checkpoints/${id}`;

const formatTimestamp = (): string => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

const getDefaultCheckpointId = (): string => {
  const timestamp = formatTimestamp().replaceAll("-", "").replaceAll(":", "");
  return `cp-${timestamp}`;
};

const getCommitMetaLine = (message: string, key: string): string => {
  const line = message.split("\n").find((entry) => entry.startsWith(`${key} `));

  if (!line) {
    throw new Error(`Checkpoint metadata is missing ${key}`);
  }

  return line.slice(key.length + 1);
};

const getCheckpointMessage = (
  id: string,
  head: string,
  indexTree: string,
  worktreeTree: string,
  created: string,
): string => `checkpoint:${id}
head ${head}
index-tree ${indexTree}
worktree-tree ${worktreeTree}
created ${created}
`;

const getIndexTree = (cwd: string): string => {
  try {
    return runGit(["write-tree"], cwd);
  } catch (error) {
    throw new Error("cannot save: index has unresolved merges (resolve conflicts first)", {
      cause: error,
    });
  }
};

const getWorktreeTree = (cwd: string, indexTree: string): string => {
  const tempDir = mkdtempSync(join(tmpdir(), "spotlight-checkpointer-"));
  const indexFile = join(tempDir, "index");
  const env = { GIT_INDEX_FILE: indexFile };

  try {
    gitWithEnv(["read-tree", indexTree], cwd, env, { trim: false });
    gitWithEnv(["add", "-A", "--", "."], cwd, env, { trim: false });
    return gitWithEnv(["write-tree"], cwd, env);
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
};

const createCheckpointCommit = (
  cwd: string,
  id: string,
  head: string,
  indexTree: string,
  worktreeTree: string,
): string => {
  const created = formatTimestamp();
  const message = getCheckpointMessage(id, head, indexTree, worktreeTree, created);

  return runGit(["commit-tree", worktreeTree], cwd, {
    env: {
      ...CHECKPOINT_AUTHOR_ENV,
      GIT_AUTHOR_DATE: created,
      GIT_COMMITTER_DATE: created,
    },
    input: message,
  });
};

export const saveCheckpoint = (cwd: string, options: CheckpointSaveOptions = {}): string => {
  const busyState = getGitBusyState(cwd);

  if (busyState !== "clean") {
    throw new Error(`Cannot save checkpoint while repository is ${busyState}.`);
  }

  const id = options.id ?? getDefaultCheckpointId();
  const ref = getCheckpointerRef(id);

  if (tryRevParse(cwd, ref) && !options.force) {
    throw new Error(`checkpoint '${id}' already exists (use --force to overwrite)`);
  }

  const head = tryRevParse(cwd, "HEAD") ?? ZERO_OID;
  const indexTree = getIndexTree(cwd);
  const worktreeTree = getWorktreeTree(cwd, indexTree);
  const commit = createCheckpointCommit(cwd, id, head, indexTree, worktreeTree);

  runGit(["update-ref", ref, commit], cwd, { trim: false });
  return id;
};

export const readCheckpointMetadata = (cwd: string, ref: string): CheckpointMetadata => {
  const commitObject = readCommitObject(cwd, ref);
  const message = commitObject.split("\n\n").slice(1).join("\n\n");
  const [firstLine] = message.split("\n");
  const id = firstLine.startsWith("checkpoint:") ? firstLine.slice("checkpoint:".length) : "";

  return {
    commit: revParse(cwd, ref),
    created: getCommitMetaLine(message, "created"),
    head: getCommitMetaLine(message, "head"),
    id,
    indexTree: getCommitMetaLine(message, "index-tree"),
    worktreeTree: getCommitMetaLine(message, "worktree-tree"),
  };
};

export const restoreCheckpoint = (cwd: string, id: string): string => {
  const ref = getCheckpointerRef(id);

  if (!tryRevParse(cwd, ref)) {
    throw new Error(`checkpoint not found: ${id}`);
  }

  const metadata = readCheckpointMetadata(cwd, ref);

  if (metadata.head === ZERO_OID) {
    throw new Error("cannot restore: checkpoint saved with unborn HEAD (no commits)");
  }

  runGit(["reset", "--hard", metadata.head], cwd, { trim: false });
  runGit(["read-tree", "--reset", "-u", metadata.worktreeTree], cwd, { trim: false });
  runGit(["clean", "-fd"], cwd, { trim: false });
  runGit(["read-tree", "--reset", metadata.indexTree], cwd, { trim: false });

  return `restored checkpoint: ${id}`;
};

export const deleteCheckpoint = (cwd: string, id: string): void => {
  deleteGitRef(cwd, getCheckpointerRef(id));
};

export const getCheckpointCommit = (cwd: string, id: string): string =>
  revParse(cwd, getCheckpointerRef(id));

export const getCheckpointChangedPaths = (cwd: string, fromRef: string, toRef: string): string[] =>
  getChangedFiles(cwd, fromRef, toRef);
