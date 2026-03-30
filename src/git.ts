import { execFileSync } from "node:child_process"
import { readFileSync, statSync } from "node:fs"
import { join } from "node:path"

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf-8" }).trim()
}

/** Get all git-tracked files in a directory */
export function getTrackedFiles(cwd: string, includeUntracked = true): string[] {
  const tracked = git(["ls-files"], cwd).split("\n").filter(Boolean)

  if (!includeUntracked) return tracked

  const untracked = git(["ls-files", "--others", "--exclude-standard"], cwd)
    .split("\n")
    .filter(Boolean)

  return [...new Set([...tracked, ...untracked])]
}

/** Get the current branch name */
export function getGitBranch(cwd: string): string {
  return git(["rev-parse", "--abbrev-ref", "HEAD"], cwd)
}

/** Check if a directory is a git worktree (has .git file, not .git directory) */
export function isGitWorktree(dir: string): boolean {
  try {
    const gitPath = join(dir, ".git")
    const stat = statSync(gitPath)
    if (stat.isFile()) {
      const content = readFileSync(gitPath, "utf-8")
      return content.startsWith("gitdir:")
    }
    return false
  } catch {
    return false
  }
}

/** Check if a directory is a git repo (has .git directory) */
export function isGitRepo(dir: string): boolean {
  try {
    const gitPath = join(dir, ".git")
    return statSync(gitPath).isDirectory()
  } catch {
    return false
  }
}

/** Check if the working tree is dirty */
export function isDirty(cwd: string): boolean {
  const status = git(["status", "--porcelain"], cwd)
  return status.length > 0
}

/** Stash changes with a named message, returns the stash name or null */
export function stash(cwd: string): string | null {
  const name = `spotlight-auto-${Date.now()}`
  git(["stash", "push", "-m", name], cwd)

  // Verify stash was created (git stash push exits 0 even if nothing to stash)
  const list = git(["stash", "list"], cwd)
  if (list.includes(name)) return name
  return null
}

/** Pop a named stash */
export function stashPop(cwd: string, name: string): void {
  const list = git(["stash", "list"], cwd)
  const lines = list.split("\n")
  for (const line of lines) {
    if (line.includes(name)) {
      const ref = line.split(":")[0]
      git(["stash", "pop", ref], cwd)
      return
    }
  }
}

/** Discard all changes in working tree */
export function discardChanges(cwd: string): void {
  git(["checkout", "--", "."], cwd)
  git(["clean", "-fd"], cwd)
}
