import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { CheckpointOptions } from "./types.js";
import { getTrackedFiles, getUntrackedFiles, gitWithEnv, revParse } from "./git.js";
import { filterProtectedPaths, getProtectedPatterns, isProtectedPath } from "./protect.js";

const CHECKPOINT_AUTHOR_ENV = {
  GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL ?? "spotlight-testing@local",
  GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME ?? "spotlight-testing",
  GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL ?? "spotlight-testing@local",
  GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME ?? "spotlight-testing",
};

const createTempIndex = (): { cleanup: () => void; env: NodeJS.ProcessEnv; indexFile: string } => {
  const root = mkdtempSync(join(tmpdir(), "spotlight-index-"));
  const indexFile = join(root, "index");

  return {
    cleanup: () => {
      rmSync(root, { force: true, recursive: true });
    },
    env: { GIT_INDEX_FILE: indexFile },
    indexFile,
  };
};

const writePathList = (paths: string[]): Buffer =>
  Buffer.from(paths.map((filePath) => `${filePath}\0`).join(""), "utf8");

const addPathsToIndex = (cwd: string, env: NodeJS.ProcessEnv, paths: string[]): void => {
  if (paths.length === 0) {
    return;
  }

  gitWithEnv(["add", "--pathspec-from-file=-", "--pathspec-file-nul"], cwd, env, {
    input: writePathList(paths),
    trim: false,
  });
};

const removePathsFromIndex = (cwd: string, env: NodeJS.ProcessEnv, paths: string[]): void => {
  if (paths.length === 0) {
    return;
  }

  gitWithEnv(
    ["rm", "--cached", "-r", "--ignore-unmatch", "--pathspec-from-file=-", "--pathspec-file-nul"],
    cwd,
    env,
    {
      input: writePathList(paths),
      trim: false,
    },
  );
};

export const createCheckpoint = (cwd: string, options: CheckpointOptions = {}): string => {
  const baselineRef = options.baselineRef ?? "HEAD";
  const includeUntracked = options.includeUntracked ?? false;
  const protectedPatterns = getProtectedPatterns(options.protect);
  const { cleanup, env } = createTempIndex();

  try {
    gitWithEnv(["read-tree", "HEAD"], cwd, env, { trim: false });
    gitWithEnv(["add", "-u"], cwd, env, { trim: false });

    if (includeUntracked) {
      const untrackedFiles = getUntrackedFiles(cwd).filter(
        (filePath) => !isProtectedPath(filePath, protectedPatterns),
      );
      addPathsToIndex(cwd, env, untrackedFiles);
    }

    const protectedPaths = filterProtectedPaths(getTrackedFiles(cwd, true), protectedPatterns);
    removePathsFromIndex(cwd, env, protectedPaths);

    const treeSha = gitWithEnv(["write-tree"], cwd, env);
    const baselineTreeSha = revParse(cwd, `${baselineRef}^{tree}`);

    if (treeSha === baselineTreeSha) {
      return revParse(cwd, baselineRef);
    }

    return gitWithEnv(["commit-tree", treeSha, "-p", "HEAD", "-m", "spotlight-checkpoint"], cwd, {
      ...env,
      ...CHECKPOINT_AUTHOR_ENV,
    });
  } finally {
    cleanup();
  }
};
