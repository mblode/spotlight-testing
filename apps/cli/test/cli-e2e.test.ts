import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, test } from "vitest";

import {
  cleanupTempDir,
  createRepoFixture,
  execGit,
  readTextFile,
  writeTextFile,
} from "./helpers/git-fixtures.js";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const cliPath = join(repoRoot, "dist", "cli.js");

const waitFor = async (predicate: () => boolean, timeoutMs = 5000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }

    await delay(50);
  }

  throw new Error("Timed out waiting for CLI state");
};

describe.skipIf(process.platform !== "darwin")("cli e2e", { timeout: 15_000 }, () => {
  beforeAll(() => {
    execFileSync("npm", ["run", "build"], {
      cwd: repoRoot,
      encoding: "utf8",
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
  });

  test("spotlight-testing on/off syncs and restores the target", async () => {
    const fixture = createRepoFixture({
      "app.txt": "initial\n",
    });
    const lockfilePath = join(fixture.parent, "spotlight.lock");
    writeTextFile(fixture.worktree, "app.txt", "updated\n");

    const processEnv = { ...process.env, SPOTLIGHT_LOCKFILE: lockfilePath };
    const spotlightProcess = spawn(
      "node",
      [cliPath, "on", fixture.worktree, "--target", fixture.root, "--debounce", "50"],
      {
        cwd: repoRoot,
        env: processEnv,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    try {
      await waitFor(
        () =>
          execGit(fixture.root, ["rev-parse", "--abbrev-ref", "HEAD"]) === "HEAD" &&
          readTextFile(fixture.root, "app.txt") === "updated",
      );

      execFileSync("node", [cliPath, "off"], {
        cwd: repoRoot,
        encoding: "utf8",
        env: processEnv,
        stdio: ["pipe", "pipe", "pipe"],
      });

      await once(spotlightProcess, "exit");

      expect(execGit(fixture.root, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("main");
      expect(readTextFile(fixture.root, "app.txt")).toBe("initial");
    } finally {
      if (spotlightProcess.exitCode === null) {
        spotlightProcess.kill("SIGTERM");
        await once(spotlightProcess, "exit");
      }

      cleanupTempDir(fixture.parent);
    }
  });

  test("spotlight-testing infers the main checkout when run from a linked worktree", async () => {
    const fixture = createRepoFixture({
      "app.txt": "initial\n",
    });
    const lockfilePath = join(fixture.parent, "spotlight.lock");
    writeTextFile(fixture.worktree, "app.txt", "updated\n");

    const processEnv = { ...process.env, SPOTLIGHT_LOCKFILE: lockfilePath };
    const spotlightProcess = spawn("node", [cliPath, "--debounce", "50"], {
      cwd: fixture.worktree,
      env: processEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });

    try {
      await waitFor(
        () =>
          execGit(fixture.root, ["rev-parse", "--abbrev-ref", "HEAD"]) === "HEAD" &&
          readTextFile(fixture.root, "app.txt") === "updated",
      );

      execFileSync("node", [cliPath, "off"], {
        cwd: repoRoot,
        encoding: "utf8",
        env: processEnv,
        stdio: ["pipe", "pipe", "pipe"],
      });

      await once(spotlightProcess, "exit");

      expect(execGit(fixture.root, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("main");
      expect(readTextFile(fixture.root, "app.txt")).toBe("initial");
    } finally {
      if (spotlightProcess.exitCode === null) {
        spotlightProcess.kill("SIGTERM");
        await once(spotlightProcess, "exit");
      }

      cleanupTempDir(fixture.parent);
    }
  });

  test("starting spotlight again replaces the active process", async () => {
    const fixture = createRepoFixture({
      "app.txt": "initial\n",
    });
    const secondWorktree = join(fixture.parent, "worktree-two");
    const lockfilePath = join(fixture.parent, "spotlight.lock");

    execGit(fixture.root, ["worktree", "add", "-b", "feature-two", secondWorktree]);
    writeTextFile(fixture.worktree, "app.txt", "from-first\n");
    writeTextFile(secondWorktree, "app.txt", "from-second\n");

    const processEnv = { ...process.env, SPOTLIGHT_LOCKFILE: lockfilePath };
    const firstProcess = spawn(
      "node",
      [cliPath, "on", fixture.worktree, "--target", fixture.root, "--debounce", "50"],
      {
        cwd: repoRoot,
        env: processEnv,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let secondProcess: ReturnType<typeof spawn> | null = null;

    try {
      await waitFor(
        () =>
          execGit(fixture.root, ["rev-parse", "--abbrev-ref", "HEAD"]) === "HEAD" &&
          readTextFile(fixture.root, "app.txt") === "from-first",
      );

      secondProcess = spawn(
        "node",
        [cliPath, "on", secondWorktree, "--target", fixture.root, "--debounce", "50"],
        {
          cwd: repoRoot,
          env: processEnv,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );

      await waitFor(() => firstProcess.exitCode !== null);
      await waitFor(
        () =>
          secondProcess?.exitCode === null &&
          execGit(fixture.root, ["rev-parse", "--abbrev-ref", "HEAD"]) === "HEAD" &&
          readTextFile(fixture.root, "app.txt") === "from-second",
      );

      execFileSync("node", [cliPath, "off"], {
        cwd: repoRoot,
        encoding: "utf8",
        env: processEnv,
        stdio: ["pipe", "pipe", "pipe"],
      });

      if (secondProcess?.exitCode === null) {
        await once(secondProcess, "exit");
      }

      expect(execGit(fixture.root, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("main");
      expect(readTextFile(fixture.root, "app.txt")).toBe("initial");
    } finally {
      if (firstProcess.exitCode === null) {
        firstProcess.kill("SIGTERM");
        await once(firstProcess, "exit");
      }

      if (secondProcess?.exitCode === null) {
        secondProcess.kill("SIGTERM");
        await once(secondProcess, "exit");
      }

      cleanupTempDir(fixture.parent);
    }
  });
});
