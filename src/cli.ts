#!/usr/bin/env node
import { resolve } from "node:path";
import { styleText } from "node:util";

import { Command } from "commander";

import { getMainWorktreeRoot } from "./git.js";
import { readLockfile } from "./lockfile.js";
import { restore, spotlight } from "./spotlight.js";

const program = new Command();

const rawArgs = process.argv.slice(2);
const hadDeprecatedNoUntracked = rawArgs.includes("--no-untracked");
const argvWithoutDeprecatedFlag = hadDeprecatedNoUntracked
  ? process.argv.filter((arg) => arg !== "--no-untracked")
  : process.argv;

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

const normalizedArgv = shouldDefaultToOn(argvWithoutDeprecatedFlag.slice(2))
  ? [...argvWithoutDeprecatedFlag.slice(0, 2), "on", ...argvWithoutDeprecatedFlag.slice(2)]
  : argvWithoutDeprecatedFlag;

if (hadDeprecatedNoUntracked) {
  console.warn(
    styleText(
      "yellow",
      "`--no-untracked` is deprecated because tracked-only sync is now the default. Use `--include-untracked` to opt in.",
    ),
  );
}

program
  .name("spotlight-testing")
  .description(
    "Run worktree changes in a repo root by creating checkpoint commits and checking them out in place.",
  )
  .version("0.0.1");

program
  .command("on")
  .description("Start syncing a worktree into the target directory")
  .argument("[worktree]", "Path to the git worktree to sync from")
  .option("-t, --target <path>", "Target directory to sync into")
  .option("-p, --protect <patterns...>", "Additional file patterns to never sync")
  .option("-d, --debounce <ms>", "Debounce interval in milliseconds", "300")
  .option("--include-untracked", "Include untracked files in checkpoint sync")
  .action(
    (
      worktree: string | undefined,
      opts: {
        debounce: string;
        includeUntracked?: boolean;
        protect?: string[];
        target?: string;
      },
    ) => {
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
          includeUntracked: opts.includeUntracked ?? false,
          protect: opts.protect,
          target: resolve(targetPath),
          worktree: worktreePath,
        });
      } catch (error) {
        console.error(styleText("red", `Error: ${error instanceof Error ? error.message : error}`));
        process.exit(1);
      }
    },
  );

program
  .command("off")
  .description("Stop a running spotlight and restore the target directory")
  .action(() => {
    const state = readLockfile();

    if (!state) {
      console.log("No spotlight is running.");
      return;
    }

    try {
      process.kill(state.pid, "SIGTERM");
      console.log(`Sent stop signal to spotlight (PID ${state.pid})`);
    } catch {
      console.log("Spotlight process not found. Restoring target state...");

      try {
        restore(state.targetPath);
      } catch (error) {
        console.error(
          styleText("red", `Cleanup error: ${error instanceof Error ? error.message : error}`),
        );
        process.exit(1);
      }

      console.log(styleText("bold", "Spotlight OFF"));
    }
  });

program
  .command("status")
  .description("Show the current spotlight status")
  .action(() => {
    const state = readLockfile();

    if (!state) {
      console.log("No spotlight is running.");
      return;
    }

    console.log(styleText("bold", "Spotlight is ON"));
    console.log(`  PID:        ${state.pid}`);
    console.log(`  Branch:     ${styleText("cyan", state.worktreeBranch)}`);
    console.log(`  From:       ${state.worktreePath}`);
    console.log(`  Into:       ${state.targetPath}`);
    console.log(`  Started:    ${state.startedAt}`);
    console.log(
      `  Checkpoint: ${state.lastCheckpointSha ? state.lastCheckpointSha.slice(0, 12) : "n/a"}`,
    );
    console.log(
      `  Restore:    ${state.originalBranch ?? `${state.originalHead.slice(0, 12)} (detached)`}`,
    );
    if (state.stashName) {
      console.log(`  Stash:      ${state.stashName}`);
    }
  });

program.parse(normalizedArgv);
