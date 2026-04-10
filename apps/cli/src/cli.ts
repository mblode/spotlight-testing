#!/usr/bin/env node
import { resolve } from "node:path";

import { Command } from "commander";

import { getGitRoot, getMainWorktreeRoot, isGitRepo } from "./git.js";
import { listActiveLockfiles, readActiveLockfile, readLockfile } from "./lockfile.js";
import { showError, showInfo, showSpotlightStatus, showSuccess } from "./output.js";
import { getPackageVersion } from "./package-version.js";
import { resetTarget, spotlight, stopSpotlightSession } from "./spotlight.js";
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

const hasArg = (args: string[], flags: string[]): boolean =>
  args.some((arg) => flags.includes(arg) || flags.some((flag) => arg.startsWith(`${flag}=`)));

const getTargetPath = (worktreePath: string, explicitTarget?: string): string | null => {
  if (explicitTarget) {
    return resolve(explicitTarget);
  }

  return getMainWorktreeRoot(worktreePath);
};

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

const getLocalRestorableSpotlightState = (): SpotlightState | null => {
  const activeScopedState = readActiveLockfile(process.cwd());

  if (activeScopedState) {
    return activeScopedState;
  }

  return readLockfile(process.cwd());
};

const getResetTargetPath = (explicitTarget?: string): string | null => {
  if (explicitTarget) {
    return resolve(explicitTarget);
  }

  const scopedState = getLocalRestorableSpotlightState();

  if (scopedState) {
    return scopedState.targetPath;
  }

  const mainWorktreeRoot = getMainWorktreeRoot(process.cwd());

  if (mainWorktreeRoot) {
    return mainWorktreeRoot;
  }

  if (isGitRepo(process.cwd())) {
    return getGitRoot(process.cwd());
  }

  return getOnlyActiveSpotlightState()?.targetPath ?? null;
};

const usedOffResetOnlyFlags = (): boolean =>
  hasArg(rawArgs, ["--target", "-t", "--remote", "-r", "--reset-to", "--no-fetch"]);

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
      const targetPath = getTargetPath(worktreePath, opts.target);

      if (!targetPath) {
        throw new Error(
          "Could not infer the main checkout from the worktree. Run from a linked worktree, pass a linked worktree path, or pass `--target <path>`.",
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
  .option("--align", "Reset the target repo to <remote>/main after stopping spotlight")
  .option(
    "--reset-to <ref>",
    "Reset the target repo to a specific Git ref after stopping spotlight",
  )
  .option("-t, --target <path>", "Target directory to reset")
  .option("-r, --remote <name>", "Remote to fetch from", "origin")
  .option("--no-fetch", "Skip git fetch before reset")
  .action(
    (opts: {
      align?: boolean;
      fetch: boolean;
      remote: string;
      resetTo?: string;
      target?: string;
    }) => {
      try {
        const shouldReset = opts.align || Boolean(opts.resetTo);

        if (opts.align && opts.resetTo) {
          throw new Error("Choose either --align or --reset-to <ref>, not both.");
        }

        if (!shouldReset) {
          if (usedOffResetOnlyFlags()) {
            throw new Error("Reset options require --align or --reset-to <ref>.");
          }

          const state = getScopedRestorableSpotlightState();

          if (!state) {
            showInfo("No spotlight is running.");
            return;
          }

          showInfo("Stopping spotlight...");
          stopSpotlightSession(state);
          showSuccess("Spotlight stopped");
          return;
        }

        const targetPath = getResetTargetPath(opts.target);

        if (!targetPath) {
          showError(
            "Could not determine a target. Run from inside the repo, use a linked worktree, or pass --target <path>.",
          );
          process.exit(1);
          return;
        }

        resetTarget({
          branch: opts.resetTo ?? `${opts.remote}/main`,
          fetch: opts.fetch,
          remote: opts.remote,
          target: targetPath,
        });
      } catch (error) {
        showError(`Cleanup error: ${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
    },
  );

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
