import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";

interface GitCommandOptions {
  env?: NodeJS.ProcessEnv;
  input?: string | Buffer;
  trim?: boolean;
}

type ExecError = Error & {
  status?: number | null;
  stderr?: Buffer | string;
  stdout?: Buffer | string;
};

type GitBusyState = "busy:cherry-pick" | "busy:merge" | "busy:rebase" | "busy:revert" | "clean";

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

export const runGit = (args: string[], cwd: string, options: GitCommandOptions = {}): string => {
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

export const getChangedFiles = (cwd: string, fromRef: string, toRef: string): string[] =>
  parseNullSeparated(runGit(["diff", "--name-only", "-z", fromRef, toRef], cwd, { trim: false }));

export const revParse = (cwd: string, ref: string): string => runGit(["rev-parse", ref], cwd);

export const tryRevParse = (cwd: string, ref: string): string | null =>
  tryGit(["rev-parse", ref], cwd);

export const getGitBranch = (cwd: string): string =>
  tryGit(["symbolic-ref", "--quiet", "--short", "HEAD"], cwd) ?? "HEAD";

const getGitDir = (cwd: string): string =>
  canonicalizePath(runGit(["rev-parse", "--absolute-git-dir"], cwd));

export const getGitCommonDir = (cwd: string): string =>
  canonicalizePath(runGit(["rev-parse", "--path-format=absolute", "--git-common-dir"], cwd));

export const getGitRoot = (cwd: string): string =>
  canonicalizePath(runGit(["rev-parse", "--show-toplevel"], cwd));

const gitPath = (cwd: string, path: string): string =>
  runGit(["rev-parse", "--path-format=absolute", "--git-path", path], cwd);

const isGitWorktree = (dir: string): boolean => {
  try {
    return getGitDir(dir) !== getGitCommonDir(dir);
  } catch {
    return false;
  }
};

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

export const getShortSha = (sha: string): string => sha.slice(0, 12);

export const getHeadLabel = (cwd: string): string => {
  const originalHead = revParse(cwd, "HEAD");
  const originalBranch = tryGit(["symbolic-ref", "--quiet", "--short", "HEAD"], cwd);

  return originalBranch ?? `${getShortSha(originalHead)} (detached)`;
};

export const getGitBusyState = (cwd: string): GitBusyState => {
  if (existsSync(gitPath(cwd, "rebase-merge")) || existsSync(gitPath(cwd, "rebase-apply"))) {
    return "busy:rebase";
  }

  if (existsSync(gitPath(cwd, "MERGE_HEAD"))) {
    return "busy:merge";
  }

  if (existsSync(gitPath(cwd, "CHERRY_PICK_HEAD"))) {
    return "busy:cherry-pick";
  }

  if (existsSync(gitPath(cwd, "REVERT_HEAD"))) {
    return "busy:revert";
  }

  return "clean";
};

export const deleteGitRef = (cwd: string, ref: string): void => {
  if (!tryRevParse(cwd, ref)) {
    return;
  }

  runGit(["update-ref", "-d", ref], cwd, { trim: false });
};

export const readCommitObject = (cwd: string, ref: string): string =>
  runGit(["cat-file", "commit", ref], cwd, { trim: false });
