import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
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

const killProcessGroup = (child: ReturnType<typeof spawn>, signal: NodeJS.Signals): void => {
  if (typeof child.pid !== "number") {
    return;
  }

  try {
    process.kill(-child.pid, signal);
  } catch {
    // Ignore races where the child already exited.
  }
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

const getBatchFilePath = (index: number): string =>
  `batch/file-${index.toString().padStart(4, "0")}.txt`;

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

  test("spotlight-testing survives repeated SIGINT during restore cleanup", async () => {
    const fileCount = 8;
    const fixture = createRepoFixture({
      "app.txt": "initial\n",
    });
    const lockfilePath = join(fixture.parent, "spotlight.lock");

    const processEnv = {
      ...process.env,
      SPOTLIGHT_LOCKFILE: lockfilePath,
      SPOTLIGHT_TEST_IGNORE_SIGNAL_DELAY_MS: "250",
    };
    const spotlightProcess = spawn(
      "node",
      [cliPath, "on", fixture.worktree, "--target", fixture.root, "--debounce", "50"],
      {
        cwd: repoRoot,
        detached: true,
        env: processEnv,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const getSpotlightOutput = captureOutput(spotlightProcess);

    try {
      await waitFor(
        () => existsSync(lockfilePath) && getSpotlightOutput().includes("Spotlight started"),
      );

      for (let index = 0; index < fileCount; index += 1) {
        writeTextFile(fixture.worktree, getBatchFilePath(index), `updated-${index}\n`);
      }

      await waitFor(
        () =>
          readTextFileIfExists(fixture.root, getBatchFilePath(0)) === "updated-0" &&
          readTextFileIfExists(fixture.root, getBatchFilePath(fileCount - 1)) ===
            `updated-${fileCount - 1}`,
        60_000,
      );

      killProcessGroup(spotlightProcess, "SIGINT");
      await waitFor(() => getSpotlightOutput().includes("Stopping spotlight..."));
      await delay(5);
      killProcessGroup(spotlightProcess, "SIGINT");

      await waitFor(() => spotlightProcess.exitCode !== null, 60_000);
      expect(spotlightProcess.exitCode).toBe(0);
      await waitFor(() => !existsSync(lockfilePath), 30_000);

      const output = getSpotlightOutput();
      expect(output).toContain("Stopping spotlight...");
      expect(output).not.toContain("Cleanup error:");
      expect(readTextFileIfExists(fixture.root, getBatchFilePath(0))).toBeNull();
      expect(readTextFileIfExists(fixture.root, getBatchFilePath(fileCount - 1))).toBeNull();
      expect(readTextFile(fixture.root, "app.txt")).toBe("initial");
    } finally {
      if (spotlightProcess.exitCode === null) {
        killProcessGroup(spotlightProcess, "SIGKILL");
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

  test("spotlight-testing keeps unrelated target runtime files during active resyncs", async () => {
    const fixture = createRepoFixture({
      "app.txt": "initial\n",
    });
    const lockfilePath = join(fixture.parent, "spotlight.lock");

    writeTextFile(fixture.worktree, "app.txt", "from-worktree-one\n");

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
          existsSync(lockfilePath) && readTextFile(fixture.root, "app.txt") === "from-worktree-one",
      );

      writeTextFile(fixture.root, "runtime-artifact.txt", "keep-me\n");
      writeTextFile(fixture.worktree, "app.txt", "from-worktree-two\n");

      await waitFor(() => readTextFile(fixture.root, "app.txt") === "from-worktree-two");

      expect(readTextFile(fixture.root, "runtime-artifact.txt")).toBe("keep-me");

      execFileSync("node", [cliPath, "off"], {
        cwd: repoRoot,
        encoding: "utf8",
        env: processEnv,
        stdio: ["pipe", "pipe", "pipe"],
      });

      await waitFor(() => !existsSync(lockfilePath));
      expect(readTextFileIfExists(fixture.root, "runtime-artifact.txt")).toBeNull();
    } finally {
      if (spotlightProcess.exitCode === null) {
        spotlightProcess.kill("SIGKILL");
      }

      cleanupTempDir(fixture.parent);
    }
  });

  test("spotlight-testing removes worktree-owned files when they are deleted mid-session", async () => {
    const fixture = createRepoFixture({
      "app.txt": "initial\n",
    });
    const lockfilePath = join(fixture.parent, "spotlight.lock");

    writeTextFile(fixture.worktree, "app.txt", "from-worktree\n");

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
        () => existsSync(lockfilePath) && readTextFile(fixture.root, "app.txt") === "from-worktree",
      );

      writeTextFile(fixture.worktree, "notes.txt", "ephemeral\n");
      await waitFor(() => readTextFileIfExists(fixture.root, "notes.txt") === "ephemeral");

      rmSync(join(fixture.worktree, "notes.txt"), { force: true });
      await waitFor(() => readTextFileIfExists(fixture.root, "notes.txt") === null);

      execFileSync("node", [cliPath, "off"], {
        cwd: repoRoot,
        encoding: "utf8",
        env: processEnv,
        stdio: ["pipe", "pipe", "pipe"],
      });

      await waitFor(() => !existsSync(lockfilePath));
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

  test("spotlight-testing infers the main checkout from an explicit worktree path", async () => {
    const fixture = createRepoFixture({
      "app.txt": "initial\n",
    });
    const lockfilePath = join(fixture.parent, "spotlight.lock");
    writeTextFile(fixture.worktree, "app.txt", "updated\n");

    const processEnv = { ...process.env, SPOTLIGHT_LOCKFILE: lockfilePath };
    const spotlightProcess = spawn("node", [cliPath, "on", fixture.worktree, "--debounce", "50"], {
      cwd: repoRoot,
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

  test("different repos do not replace each other", async () => {
    const firstFixture = createRepoFixture({
      "app.txt": "frontyard-initial\n",
    });
    const secondFixture = createRepoFixture({
      "app.txt": "chat-initial\n",
    });
    const processEnv = { ...process.env };
    delete processEnv.SPOTLIGHT_LOCKFILE;

    writeTextFile(firstFixture.worktree, "app.txt", "frontyard-first\n");
    writeTextFile(secondFixture.worktree, "app.txt", "chat-first\n");

    const firstProcess = spawn(
      "node",
      [cliPath, "on", firstFixture.worktree, "--target", firstFixture.root, "--debounce", "50"],
      {
        cwd: repoRoot,
        env: processEnv,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const getFirstOutput = captureOutput(firstProcess);

    let secondProcess: ReturnType<typeof spawn> | null = null;

    try {
      await waitFor(
        () =>
          firstProcess.exitCode === null &&
          readTextFile(firstFixture.root, "app.txt") === "frontyard-first" &&
          getFirstOutput().includes("Spotlight started"),
      );

      secondProcess = spawn(
        "node",
        [cliPath, "on", secondFixture.worktree, "--target", secondFixture.root, "--debounce", "50"],
        {
          cwd: repoRoot,
          env: processEnv,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      const getSecondOutput = captureOutput(secondProcess);

      await waitFor(
        () =>
          firstProcess.exitCode === null &&
          secondProcess?.exitCode === null &&
          readTextFile(secondFixture.root, "app.txt") === "chat-first" &&
          getSecondOutput().includes("Spotlight started"),
      );

      writeTextFile(firstFixture.worktree, "app.txt", "frontyard-second\n");

      await waitFor(() => readTextFile(firstFixture.root, "app.txt") === "frontyard-second");

      execFileSync("node", [cliPath, "off"], {
        cwd: firstFixture.root,
        encoding: "utf8",
        env: processEnv,
        stdio: ["pipe", "pipe", "pipe"],
      });

      await waitFor(() => firstProcess.exitCode !== null);
      expect(readTextFile(firstFixture.root, "app.txt")).toBe("frontyard-initial");
      expect(secondProcess?.exitCode).toBeNull();
      expect(readTextFile(secondFixture.root, "app.txt")).toBe("chat-first");

      execFileSync("node", [cliPath, "off"], {
        cwd: secondFixture.root,
        encoding: "utf8",
        env: processEnv,
        stdio: ["pipe", "pipe", "pipe"],
      });

      await waitFor(() => secondProcess?.exitCode !== null);
      expect(readTextFile(secondFixture.root, "app.txt")).toBe("chat-initial");
    } finally {
      if (firstProcess.exitCode === null) {
        firstProcess.kill("SIGKILL");
      }

      if (secondProcess?.exitCode === null) {
        secondProcess.kill("SIGKILL");
      }

      cleanupTempDir(firstFixture.parent);
      cleanupTempDir(secondFixture.parent);
    }
  });
});
