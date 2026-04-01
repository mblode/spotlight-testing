import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync, mkdtempSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_AUTHOR_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "Test",
};

export interface RepoFixture {
  parent: string;
  root: string;
  worktree: string;
}

export interface RepoOnlyFixture {
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
