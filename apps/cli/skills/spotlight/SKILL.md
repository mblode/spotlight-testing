---
name: spotlight
description: Checkpoint git worktree changes into a main repo directory for testing with a single Docker environment. Use when the user wants to use spotlight, run spotlight commands, or asks about spotlight-testing features.
---

# spotlight-testing

Checkpoint git worktree changes into a main repo directory for testing with a single Docker environment.

## Commands

| Command                                       | What it does                                               |
| --------------------------------------------- | ---------------------------------------------------------- |
| `spotlight-testing on <worktree>`             | Start checkpointing worktree changes into target directory |
| `spotlight-testing on <worktree> -t <target>` | Checkpoint into a specific target directory                |
| `spotlight-testing off`                       | Stop spotlight and restore target directory                |
| `spotlight-testing status`                    | Show current spotlight state                               |
| `spotlight-testing --help`                    | Show available commands and options                        |
| `spotlight-testing --version`                 | Show version number                                        |

## Defaults

- Spotlight tracks git-tracked files by default.
- Pass `--include-untracked` to include untracked files in checkpoints.
- Spotlight parks and restores target-local `.env*` files during checkpoint checkout.
- If the target already has local changes, Spotlight creates a temporary `spotlight-auto-*` stash in the target repo and restores it on exit.
- `syncOnce()` is stricter and requires a clean target working tree.
- The worktree and target must share the same Git common object database.
