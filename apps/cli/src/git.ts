import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";

interface GitCommandOptions {
  env?: NodeJS.ProcessEnv;
  ignoreSignals?: boolean;
  input?: string | Buffer;
  trim?: boolean;
}

type GitReadOptions = Omit<GitCommandOptions, "env" | "input">;

type ExecError = Error & {
  message: string;
  signal?: NodeJS.Signals | null;
  status?: number | null;
  stderr?: Buffer | string;
  stdout?: Buffer | string;
};

type GitBusyState = "busy:cherry-pick" | "busy:merge" | "busy:rebase" | "busy:revert" | "clean";

const parseNullSeparated = (value: string): string[] => value.split("\0").filter(Boolean);

const encodeNullSeparated = (paths: string[]): Buffer =>
  Buffer.from(paths.map((filePath) => `${filePath}\0`).join(""), "utf8");

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

const isInterruptedExecError = (error: ExecError): boolean =>
  error.signal === "SIGINT" || error.signal === "SIGTERM";

const getIgnoreSignalDelaySeconds = (): string | null => {
  const delayMs = Number.parseInt(process.env.SPOTLIGHT_TEST_IGNORE_SIGNAL_DELAY_MS ?? "", 10);

  if (!Number.isFinite(delayMs) || delayMs <= 0) {
    return null;
  }

  return (delayMs / 1000).toFixed(3);
};

const getGitCommand = (args: string[], ignoreSignals: boolean): [string, string[]] => {
  if (!ignoreSignals) {
    return ["git", args];
  }

  const ignoreSignalDelaySeconds = getIgnoreSignalDelaySeconds();

  return [
    "sh",
    [
      "-c",
      'trap "" INT TERM; if [ "$1" != "0" ]; then sleep "$1"; fi; shift; exec "$@"',
      "sh",
      ignoreSignalDelaySeconds ?? "0",
      "git",
      ...args,
    ],
  ];
};

export const runGit = (args: string[], cwd: string, options: GitCommandOptions = {}): string => {
  const [command, commandArgs] = getGitCommand(args, options.ignoreSignals ?? false);

  while (true) {
    try {
      const output = execFileSync(command, commandArgs, {
        cwd,
        encoding: "utf8",
        env: { ...process.env, ...options.env },
        input: options.input,
        stdio: ["pipe", "pipe", "pipe"],
      });

      return options.trim === false ? output : output.trim();
    } catch (error) {
      const execError = error as ExecError;

      if (options.ignoreSignals && isInterruptedExecError(execError)) {
        continue;
      }

      throw formatGitError(args, execError);
    }
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
  parseNullSeparated(
    runGit(["diff", "--name-only", "--no-renames", "-z", fromRef, toRef], cwd, { trim: false }),
  );

export const restoreWorktreePaths = (cwd: string, sourceRef: string, paths: string[]): void => {
  if (paths.length === 0) {
    return;
  }

  runGit(
    [
      "restore",
      "--source",
      sourceRef,
      "--worktree",
      "--pathspec-from-file=-",
      "--pathspec-file-nul",
    ],
    cwd,
    {
      input: encodeNullSeparated(paths),
      trim: false,
    },
  );
};

export const hasPathInRef = (cwd: string, ref: string, filePath: string): boolean =>
  tryGit(["cat-file", "-e", `${ref}:${filePath}`], cwd) !== null;

export const revParse = (cwd: string, ref: string, options: GitReadOptions = {}): string =>
  runGit(["rev-parse", ref], cwd, options);

export const tryRevParse = (
  cwd: string,
  ref: string,
  options: GitReadOptions = {},
): string | null => tryGit(["rev-parse", ref], cwd, options);

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

export const readCommitObject = (cwd: string, ref: string, options: GitReadOptions = {}): string =>
  runGit(["cat-file", "commit", ref], cwd, { ...options, trim: false });
