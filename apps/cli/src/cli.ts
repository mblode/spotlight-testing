#!/usr/bin/env node
import { resolve } from "node:path";

import { Command } from "commander";

import { getMainWorktreeRoot } from "./git.js";
import {
  listActiveLockfiles,
  readActiveLockfile,
  readLockfile,
  waitForLockfileRelease,
} from "./lockfile.js";
import { showError, showInfo, showSpotlightStatus, showSuccess } from "./output.js";
import { getPackageVersion } from "./package-version.js";
import { restore, spotlight } from "./spotlight.js";
import type { SpotlightState } from "./types.js";

const program = new Command();

const shouldDefaultToOn = (args: string[]): boolean => {
  const [firstArg] = args;

  if (!firstArg) {
    return true;
  }

  if (!firstArg.startsWith("-")) {
    return false;
  }

  return (
    firstArg !== "-h" && firstArg !== "--help" && firstArg !== "-V" && firstArg !== "--version"
  );
};

const rawArgs = process.argv.slice(2);
const normalizedArgv = shouldDefaultToOn(rawArgs)
  ? [...process.argv.slice(0, 2), "on", ...rawArgs]
  : process.argv;

const getOnlyActiveSpotlightState = (): SpotlightState | null => {
  const activeLockfiles = listActiveLockfiles();

  if (activeLockfiles.length === 0) {
    return null;
  }

  if (activeLockfiles.length === 1) {
    return activeLockfiles[0] ?? null;
  }

  throw new Error(
    "Multiple spotlight sessions are running. Run this command from the repo or worktree you want to inspect.",
  );
};

const getScopedActiveSpotlightState = (): SpotlightState | null => {
  const scopedState = readActiveLockfile(process.cwd());

  if (scopedState) {
    return scopedState;
  }

  if (readLockfile(process.cwd())) {
    return null;
  }

  return getOnlyActiveSpotlightState();
};

const getScopedRestorableSpotlightState = (): SpotlightState | null => {
  const activeScopedState = readActiveLockfile(process.cwd());

  if (activeScopedState) {
    return activeScopedState;
  }

  const scopedState = readLockfile(process.cwd());

  if (scopedState) {
    return scopedState;
  }

  return getOnlyActiveSpotlightState();
};

program
  .name("spotlight-testing")
  .description(
    "Run worktree changes in a repo root by saving Conductor-style checkpoints and restoring them in place.",
  )
  .version(getPackageVersion());

program
  .command("on")
  .description("Start syncing a worktree into the target directory")
  .argument("[worktree]", "Path to the git worktree to sync from")
  .option("-t, --target <path>", "Target directory to sync into")
  .option("-d, --debounce <ms>", "Debounce interval in milliseconds", "300")
  .action((worktree: string | undefined, opts: { debounce: string; target?: string }) => {
    try {
      const worktreePath = resolve(worktree ?? process.cwd());
      let targetPath: string | null;

      if (opts.target) {
        targetPath = resolve(opts.target);
      } else if (worktree) {
        targetPath = process.cwd();
      } else {
        targetPath = getMainWorktreeRoot(worktreePath);
      }

      if (!targetPath) {
        throw new Error(
          "Could not infer the main checkout from the current directory. Run from a linked worktree or pass `--target <path>`.",
        );
      }

      spotlight({
        debounce: Number.parseInt(opts.debounce, 10),
        target: resolve(targetPath),
        worktree: worktreePath,
      });
    } catch (error) {
      showError(`Error: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

program
  .command("off")
  .description("Stop a running spotlight and restore the target directory")
  .action(() => {
    try {
      const state = getScopedRestorableSpotlightState();

      if (!state) {
        showInfo("No spotlight is running.");
        return;
      }

      showInfo("Stopping spotlight...");

      try {
        process.kill(state.pid, "SIGTERM");
      } catch {
        restore(state.targetPath);
        showSuccess("Spotlight stopped");
        return;
      }

      waitForLockfileRelease(state.pid, state.targetPath);

      if (readLockfile(state.targetPath)?.pid === state.pid) {
        restore(state.targetPath);
      }

      showSuccess("Spotlight stopped");
    } catch (error) {
      showError(`Cleanup error: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

program
  .command("status")
  .description("Show the current spotlight status")
  .action(() => {
    try {
      const state = getScopedActiveSpotlightState();

      if (!state) {
        showInfo("No spotlight is running.");
        return;
      }

      showSpotlightStatus(state);
    } catch (error) {
      showError(`Error: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

program.parse(normalizedArgv);
