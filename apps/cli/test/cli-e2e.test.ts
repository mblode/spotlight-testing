import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, test } from "vitest";

import {
  cleanupTempDir,
  createRepoFixture,
  execGit,
  readCachedDiffNames,
  readTextFile,
  readTextFileIfExists,
  writeTextFile,
} from "./helpers/git-fixtures.js";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const cliPath = join(repoRoot, "dist", "cli.js");
const ansiEscape = String.fromCodePoint(27);
const ansiPattern = new RegExp(`${ansiEscape}(?:[@-Z\\\\-_]|\\[[0-?]*[ -/]*[@-~])`, "g");

const stripAnsi = (value: string): string => value.replace(ansiPattern, "");

const readOutput = (result: { stderr?: string | Buffer; stdout?: string | Buffer }): string =>
  stripAnsi(`${result.stdout?.toString() ?? ""}${result.stderr?.toString() ?? ""}`);

const captureOutput = (child: ReturnType<typeof spawn>): (() => string) => {
  let output = "";

  const appendOutput = (chunk: Buffer | string): void => {
    output += chunk.toString();
  };

  child.stdout?.on("data", appendOutput);
  child.stderr?.on("data", appendOutput);

  return (): string => stripAnsi(output);
};

const waitFor = async (predicate: () => boolean, timeoutMs = 30_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }

    await delay(50);
  }

  throw new Error("Timed out waiting for CLI state");
};

describe.skipIf(process.platform !== "darwin")("cli e2e", { timeout: 90_000 }, () => {
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
    const getSpotlightOutput = captureOutput(spotlightProcess);

    try {
      await waitFor(
        () =>
          existsSync(lockfilePath) &&
          readTextFile(fixture.root, "app.txt") === "updated" &&
          getSpotlightOutput().includes("Spotlight started"),
      );

      const startupOutput = getSpotlightOutput();
      expect(startupOutput).toContain("Starting spotlight...");
      expect(startupOutput).toContain("Spotlight started");
      expect(startupOutput).not.toContain("Spotlight ON");
      expect(startupOutput).not.toContain("Watching for changes");
      expect(startupOutput).not.toContain("Initial checkpoint:");

      const stopResult = spawnSync("node", [cliPath, "off"], {
        cwd: repoRoot,
        encoding: "utf8",
        env: processEnv,
      });

      if (stopResult.error) {
        throw stopResult.error;
      }

      expect(stopResult.status).toBe(0);
      const stopOutput = readOutput(stopResult);
      expect(stopOutput).toContain("Stopping spotlight...");
      expect(stopOutput).toContain("Spotlight stopped");

      await waitFor(() => !existsSync(lockfilePath));

      expect(execGit(fixture.root, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("main");
      expect(readTextFile(fixture.root, "app.txt")).toBe("initial");
    } finally {
      if (spotlightProcess.exitCode === null) {
        spotlightProcess.kill("SIGKILL");
      }

      cleanupTempDir(fixture.parent);
    }
  });

  test("spotlight-testing status remains the detailed view", async () => {
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
        () => existsSync(lockfilePath) && readTextFile(fixture.root, "app.txt") === "updated",
      );

      const statusResult = spawnSync("node", [cliPath, "status"], {
        cwd: repoRoot,
        encoding: "utf8",
        env: processEnv,
      });

      if (statusResult.error) {
        throw statusResult.error;
      }

      expect(statusResult.status).toBe(0);
      const statusOutput = readOutput(statusResult);
      expect(statusOutput).toContain("Spotlight ON");
      expect(statusOutput).toContain("Branch");
      expect(statusOutput).toContain("From");
      expect(statusOutput).toContain("Into");

      spawnSync("node", [cliPath, "off"], {
        cwd: repoRoot,
        encoding: "utf8",
        env: processEnv,
      });

      await waitFor(() => !existsSync(lockfilePath));
    } finally {
      if (spotlightProcess.exitCode === null) {
        spotlightProcess.kill("SIGKILL");
      }

      cleanupTempDir(fixture.parent);
    }
  });

  test("spotlight-testing restores dirty tracked, staged, and untracked target state on off", async () => {
    const fixture = createRepoFixture({
      "app.txt": "initial\n",
      "staged.txt": "before-stage\n",
    });
    const lockfilePath = join(fixture.parent, "spotlight.lock");

    writeTextFile(fixture.root, "app.txt", "target-local\n");
    writeTextFile(fixture.root, "scratch.txt", "scratch\n");
    writeTextFile(fixture.root, "staged.txt", "after-stage\n");
    execGit(fixture.root, ["add", "staged.txt"]);

    writeTextFile(fixture.worktree, "app.txt", "updated-from-worktree\n");
    writeTextFile(fixture.worktree, "new.txt", "from-worktree\n");

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
          existsSync(lockfilePath) &&
          readTextFile(fixture.root, "app.txt") === "updated-from-worktree",
      );

      execFileSync("node", [cliPath, "off"], {
        cwd: repoRoot,
        encoding: "utf8",
        env: processEnv,
        stdio: ["pipe", "pipe", "pipe"],
      });

      await waitFor(() => !existsSync(lockfilePath));

      expect(readTextFile(fixture.root, "app.txt")).toBe("target-local");
      expect(readTextFile(fixture.root, "scratch.txt")).toBe("scratch");
      expect(readTextFile(fixture.root, "staged.txt")).toBe("after-stage");
      expect(readCachedDiffNames(fixture.root)).toEqual(["staged.txt"]);
      expect(readTextFileIfExists(fixture.root, "new.txt")).toBeNull();
    } finally {
      if (spotlightProcess.exitCode === null) {
        spotlightProcess.kill("SIGKILL");
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
        () => existsSync(lockfilePath) && readTextFile(fixture.root, "app.txt") === "updated",
      );

      execFileSync("node", [cliPath, "off"], {
        cwd: repoRoot,
        encoding: "utf8",
        env: processEnv,
        stdio: ["pipe", "pipe", "pipe"],
      });

      await waitFor(() => !existsSync(lockfilePath));

      expect(execGit(fixture.root, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("main");
      expect(readTextFile(fixture.root, "app.txt")).toBe("initial");
    } finally {
      if (spotlightProcess.exitCode === null) {
        spotlightProcess.kill("SIGKILL");
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
        () => existsSync(lockfilePath) && readTextFile(fixture.root, "app.txt") === "from-first",
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
          existsSync(lockfilePath) &&
          secondProcess?.exitCode === null &&
          readTextFile(fixture.root, "app.txt") === "from-second",
      );

      execFileSync("node", [cliPath, "off"], {
        cwd: repoRoot,
        encoding: "utf8",
        env: processEnv,
        stdio: ["pipe", "pipe", "pipe"],
      });

      if (secondProcess?.exitCode === null) {
        await waitFor(
          () => !existsSync(lockfilePath) && readTextFile(fixture.root, "app.txt") === "initial",
        );
      }

      expect(execGit(fixture.root, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("main");
      expect(readTextFile(fixture.root, "app.txt")).toBe("initial");
    } finally {
      if (firstProcess.exitCode === null) {
        firstProcess.kill("SIGKILL");
      }

      if (secondProcess?.exitCode === null) {
        secondProcess.kill("SIGKILL");
      }

      cleanupTempDir(fixture.parent);
    }
  });
});
