import { resolve } from "node:path"
import { styleText } from "node:util"
import { Command } from "commander"

import { spotlight } from "./spotlight.js"
import { isLocked, readLockfile, removeLockfile } from "./lockfile.js"
import { discardChanges, stashPop } from "./git.js"

const program = new Command()

program
  .name("spotlight")
  .description("Sync git worktree changes into a main repo directory for testing with a single Docker environment")
  .version("0.0.1")

program
  .command("on")
  .description("Start syncing a worktree into the target directory")
  .argument("<worktree>", "Path to the git worktree to sync from")
  .option("-t, --target <path>", "Target directory to sync into (default: current directory)", process.cwd())
  .option("-p, --protect <patterns...>", "Additional file patterns to never sync")
  .option("-d, --debounce <ms>", "Debounce interval in milliseconds", "300")
  .option("--no-untracked", "Exclude untracked files from sync")
  .action(async (worktree: string, opts: { target: string; protect?: string[]; debounce: string; untracked: boolean }) => {
    try {
      await spotlight({
        worktree: resolve(worktree),
        target: resolve(opts.target),
        protect: opts.protect,
        debounce: Number.parseInt(opts.debounce, 10),
        includeUntracked: opts.untracked,
      })
    } catch (err) {
      console.error(styleText("red", `Error: ${err instanceof Error ? err.message : err}`))
      process.exit(1)
    }
  })

program
  .command("off")
  .description("Stop a running spotlight and restore the target directory")
  .action(() => {
    if (!isLocked()) {
      console.log("No spotlight is running.")
      return
    }

    const state = readLockfile()
    if (!state) {
      console.log("No spotlight state found.")
      removeLockfile()
      return
    }

    // Send SIGTERM to the running spotlight process
    try {
      process.kill(state.pid, "SIGTERM")
      console.log(`Sent stop signal to spotlight (PID ${state.pid})`)
    } catch {
      // Process already dead, clean up manually
      console.log("Spotlight process not found. Cleaning up...")
      try {
        discardChanges(state.targetPath)
        if (state.stashName) {
          stashPop(state.targetPath, state.stashName)
        }
      } catch (err) {
        console.error(styleText("red", `Cleanup error: ${err}`))
      }
      removeLockfile()
      console.log(styleText("bold", "Spotlight OFF"))
    }
  })

program
  .command("status")
  .description("Show the current spotlight status")
  .action(() => {
    if (!isLocked()) {
      console.log("No spotlight is running.")
      return
    }

    const state = readLockfile()
    if (!state) {
      console.log("No spotlight state found.")
      return
    }

    console.log(styleText("bold", "Spotlight is ON"))
    console.log(`  PID:      ${state.pid}`)
    console.log(`  Branch:   ${styleText("cyan", state.worktreeBranch)}`)
    console.log(`  From:     ${state.worktreePath}`)
    console.log(`  Into:     ${state.targetPath}`)
    console.log(`  Started:  ${state.startedAt}`)
    if (state.stashName) {
      console.log(`  Stash:    ${state.stashName}`)
    }
  })

program.parse()
