import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const git = (args: string[], cwd: string): string =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

/** Get all git-tracked files in a directory */
export const getTrackedFiles = (cwd: string, includeUntracked = true): string[] => {
  const tracked = git(["ls-files"], cwd).split("\n").filter(Boolean);

  if (!includeUntracked) {
    return tracked;
  }

  const untracked = git(["ls-files", "--others", "--exclude-standard"], cwd)
    .split("\n")
    .filter(Boolean);

  return [...new Set([...tracked, ...untracked])];
};

/** Get the current branch name */
export const getGitBranch = (cwd: string): string =>
  git(["rev-parse", "--abbrev-ref", "HEAD"], cwd);

/** Check if a directory is a git worktree (has .git file, not .git directory) */
export const isGitWorktree = (dir: string): boolean => {
  try {
    const gitPath = join(dir, ".git");
    const stat = statSync(gitPath);
    if (stat.isFile()) {
      const content = readFileSync(gitPath, "utf8");
      return content.startsWith("gitdir:");
    }
    return false;
  } catch {
    return false;
  }
};

/** Check if a directory is a git repo (has .git directory) */
export const isGitRepo = (dir: string): boolean => {
  try {
    const gitPath = join(dir, ".git");
    return statSync(gitPath).isDirectory();
  } catch {
    return false;
  }
};

/** Check if the working tree is dirty */
export const isDirty = (cwd: string): boolean => {
  const status = git(["status", "--porcelain"], cwd);
  return status.length > 0;
};

/** Stash changes with a named message, returns the stash name or null */
export const stash = (cwd: string): string | null => {
  const name = `spotlight-auto-${Date.now()}`;
  git(["stash", "push", "-m", name], cwd);

  const list = git(["stash", "list"], cwd);
  if (list.includes(name)) {
    return name;
  }
  return null;
};

/** Pop a named stash */
export const stashPop = (cwd: string, name: string): void => {
  const list = git(["stash", "list"], cwd);
  const lines = list.split("\n");
  for (const line of lines) {
    if (line.includes(name)) {
      const [ref] = line.split(":");
      git(["stash", "pop", ref], cwd);
      return;
    }
  }
};

/** Discard all changes in working tree */
export const discardChanges = (cwd: string): void => {
  git(["checkout", "--", "."], cwd);
  git(["clean", "-fd"], cwd);
};
