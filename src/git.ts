import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";

import type { HeadState } from "./types.js";

interface GitCommandOptions {
  env?: NodeJS.ProcessEnv;
  input?: string | Buffer;
  trim?: boolean;
}

type ExecError = Error & {
  stderr?: Buffer | string;
  stdout?: Buffer | string;
};

const parseNullSeparated = (value: string): string[] => value.split("\0").filter(Boolean);

const parseWorktreeList = (value: string): string[] =>
  value
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length));

const formatGitError = (args: string[], error: ExecError): Error => {
  const stderr =
    typeof error.stderr === "string" ? error.stderr.trim() : error.stderr?.toString("utf8").trim();
  const stdout =
    typeof error.stdout === "string" ? error.stdout.trim() : error.stdout?.toString("utf8").trim();
  const details = stderr || stdout || error.message;

  return new Error(`git ${args.join(" ")} failed: ${details}`);
};

const runGit = (args: string[], cwd: string, options: GitCommandOptions = {}): string => {
  try {
    const output = execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      env: { ...process.env, ...options.env },
      input: options.input,
      stdio: ["pipe", "pipe", "pipe"],
    });

    return options.trim === false ? output : output.trim();
  } catch (error) {
    throw formatGitError(args, error as ExecError);
  }
};

const tryGit = (args: string[], cwd: string, options: GitCommandOptions = {}): string | null => {
  try {
    return runGit(args, cwd, options);
  } catch {
    return null;
  }
};

const canonicalizePath = (filePath: string): string => {
  if (!existsSync(filePath)) {
    return filePath;
  }

  return realpathSync(filePath);
};

export const gitWithEnv = (
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  options: Omit<GitCommandOptions, "env"> = {},
): string => runGit(args, cwd, { ...options, env });

/** Get all git-tracked files in a directory */
export const getTrackedFiles = (cwd: string, includeUntracked = false): string[] => {
  const tracked = parseNullSeparated(runGit(["ls-files", "-z"], cwd, { trim: false }));

  if (!includeUntracked) {
    return tracked;
  }

  const untracked = parseNullSeparated(
    runGit(["ls-files", "--others", "--exclude-standard", "-z"], cwd, { trim: false }),
  );

  return [...new Set([...tracked, ...untracked])];
};

export const getUntrackedFiles = (cwd: string): string[] =>
  parseNullSeparated(
    runGit(["ls-files", "--others", "--exclude-standard", "-z"], cwd, { trim: false }),
  );

export const getChangedFiles = (cwd: string, fromRef: string, toRef: string): string[] =>
  parseNullSeparated(runGit(["diff", "--name-only", "-z", fromRef, toRef], cwd, { trim: false }));

export const revParse = (cwd: string, ref: string): string => runGit(["rev-parse", ref], cwd);

export const tryRevParse = (cwd: string, ref: string): string | null =>
  tryGit(["rev-parse", ref], cwd);

/** Get the current branch name, or HEAD when detached */
export const getGitBranch = (cwd: string): string =>
  tryGit(["symbolic-ref", "--quiet", "--short", "HEAD"], cwd) ?? "HEAD";

export const getGitDir = (cwd: string): string =>
  canonicalizePath(runGit(["rev-parse", "--absolute-git-dir"], cwd));

export const getGitCommonDir = (cwd: string): string =>
  canonicalizePath(runGit(["rev-parse", "--path-format=absolute", "--git-common-dir"], cwd));

export const gitPath = (cwd: string, path: string): string =>
  runGit(["rev-parse", "--path-format=absolute", "--git-path", path], cwd);

/** Check if a directory is a git worktree (shares objects with another checkout) */
export const isGitWorktree = (dir: string): boolean => {
  try {
    return getGitDir(dir) !== getGitCommonDir(dir);
  } catch {
    return false;
  }
};

/** Check if a directory is a git repo or worktree */
export const isGitRepo = (dir: string): boolean =>
  tryGit(["rev-parse", "--is-inside-work-tree"], dir) === "true";

export const getMainWorktreeRoot = (cwd: string): string | null => {
  if (!isGitWorktree(cwd)) {
    return null;
  }

  const commonDir = getGitCommonDir(cwd);
  const worktrees = parseWorktreeList(
    runGit(["worktree", "list", "--porcelain"], cwd, { trim: false }),
  );

  for (const worktree of worktrees) {
    try {
      if (getGitDir(worktree) === commonDir) {
        return canonicalizePath(worktree);
      }
    } catch {
      // Ignore prunable or missing worktree entries while looking for the primary checkout.
    }
  }

  return null;
};

export const isSameRepo = (dirA: string, dirB: string): boolean => {
  try {
    return getGitCommonDir(dirA) === getGitCommonDir(dirB);
  } catch {
    return false;
  }
};

export const isRebaseInProgress = (cwd: string): boolean =>
  existsSync(gitPath(cwd, "rebase-merge")) || existsSync(gitPath(cwd, "rebase-apply"));

export const isMergeInProgress = (cwd: string): boolean => existsSync(gitPath(cwd, "MERGE_HEAD"));

/** Check if the working tree has any changes, including untracked files */
export const hasChanges = (cwd: string): boolean =>
  runGit(["status", "--porcelain"], cwd, { trim: false }).trim().length > 0;

export const getHeadState = (cwd: string): HeadState => {
  const originalHead = revParse(cwd, "HEAD");
  const originalBranch = tryGit(["symbolic-ref", "--quiet", "--short", "HEAD"], cwd);

  return {
    isDetached: originalBranch === null,
    originalBranch,
    originalHead,
  };
};

/** Stash changes with a named message, returns the stash name or null */
export const stash = (cwd: string, includeUntracked = true): string | null => {
  const name = `spotlight-auto-${Date.now()}-${process.pid}`;
  const args = ["stash", "push"];

  if (includeUntracked) {
    args.push("-u");
  }

  args.push("-m", name);

  runGit(args, cwd, { trim: false });

  const list = runGit(["stash", "list"], cwd, { trim: false });
  return list.includes(name) ? name : null;
};

/** Pop a named stash */
export const stashPop = (cwd: string, name: string): boolean => {
  const list = runGit(["stash", "list"], cwd, { trim: false });
  const lines = list.split("\n").filter(Boolean);

  for (const line of lines) {
    if (!line.includes(name)) {
      continue;
    }

    const [ref] = line.split(":");
    runGit(["stash", "pop", ref], cwd, { trim: false });
    return true;
  }

  return false;
};

export const checkoutDetached = (cwd: string, ref: string, force = false): void => {
  const args = ["checkout"];

  if (force) {
    args.push("-f");
  }

  args.push("--detach", ref);
  runGit(args, cwd, { trim: false });
};

export const checkoutBranch = (cwd: string, branch: string, force = false): void => {
  const args = ["checkout"];

  if (force) {
    args.push("-f");
  }

  args.push(branch);
  runGit(args, cwd, { trim: false });
};

export const checkoutCommit = (cwd: string, commitSha: string, force = false): void => {
  checkoutDetached(cwd, commitSha, force);
};

export const restoreHeadState = (cwd: string, state: HeadState): string => {
  if (state.originalBranch) {
    const branchRef = tryRevParse(cwd, `refs/heads/${state.originalBranch}`);

    if (branchRef === state.originalHead) {
      checkoutBranch(cwd, state.originalBranch, true);
      return state.originalBranch;
    }
  }

  checkoutCommit(cwd, state.originalHead, true);
  return `${state.originalHead.slice(0, 12)} (detached)`;
};

export const getShortSha = (sha: string): string => sha.slice(0, 12);
