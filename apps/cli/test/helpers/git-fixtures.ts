import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, mkdtempSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_AUTHOR_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "Test",
};

interface RepoFixture {
  parent: string;
  root: string;
  worktree: string;
}

interface RepoOnlyFixture {
  parent: string;
  root: string;
}

export const execGit = (cwd: string, args: string[], input?: string): string =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: GIT_ENV,
    input,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();

export const createTempDir = (prefix = "spotlight-testing-"): string =>
  mkdtempSync(join(tmpdir(), prefix));

export const cleanupTempDir = (dir: string): void => {
  rmSync(dir, { force: true, recursive: true });
};

export const writeTextFile = (root: string, relativePath: string, contents: string): void => {
  const filePath = join(root, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
};

export const readTextFile = (root: string, relativePath: string): string =>
  readFileSync(join(root, relativePath), "utf8").trim();

export const readTextFileIfExists = (root: string, relativePath: string): string | null => {
  const filePath = join(root, relativePath);
  return existsSync(filePath) ? readFileSync(filePath, "utf8").trim() : null;
};

export const readGitTree = (cwd: string, ref: string): string[] =>
  execGit(cwd, ["ls-tree", "-r", "--name-only", ref]).split("\n").filter(Boolean);

export const readCachedDiffNames = (cwd: string): string[] =>
  execGit(cwd, ["diff", "--cached", "--name-only"]).split("\n").filter(Boolean);

export const readGitCommonDir = (cwd: string): string =>
  execGit(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);

export const readGitPath = (cwd: string, relativePath: string): string =>
  execGit(cwd, ["rev-parse", "--path-format=absolute", "--git-path", relativePath]);

export const getCheckpointNamespaceRefs = (cwd: string): string[] =>
  execGit(cwd, ["for-each-ref", "refs/conductor-checkpoints", "--format=%(refname)"])
    .split("\n")
    .filter(Boolean);

const DEFAULT_REPO_FILES: Record<string, string> = { "app.txt": "initial\n" };

export const createRepoFixture = (files?: Record<string, string>): RepoFixture => {
  const parent = createTempDir();
  const root = join(parent, "repo");
  mkdirSync(root, { recursive: true });
  execGit(root, ["init", "-b", "main"]);

  for (const [relativePath, contents] of Object.entries(files ?? DEFAULT_REPO_FILES)) {
    writeTextFile(root, relativePath, contents);
  }

  execGit(root, ["add", "."]);
  execGit(root, ["commit", "-m", "init"]);

  const worktree = join(parent, "worktree");
  execGit(root, ["worktree", "add", "-b", "feature", worktree]);

  return { parent, root, worktree };
};

export const createRepoFixtureWithoutWorktree = (
  files?: Record<string, string>,
): RepoOnlyFixture => {
  const parent = createTempDir();
  const root = join(parent, "repo");
  mkdirSync(root, { recursive: true });
  execGit(root, ["init", "-b", "main"]);

  for (const [relativePath, contents] of Object.entries(files ?? DEFAULT_REPO_FILES)) {
    writeTextFile(root, relativePath, contents);
  }

  execGit(root, ["add", "."]);
  execGit(root, ["commit", "-m", "init"]);

  return { parent, root };
};
