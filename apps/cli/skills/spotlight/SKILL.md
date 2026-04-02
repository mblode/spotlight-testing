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

- Spotlight includes untracked files in checkpoints by default.
- Ignored files are left in place; they are not checkpointed or rolled back.
- Workspace state is stored in named Git checkpoint refs.
- Spotlight saves the target root at startup and restores it on exit with destructive Git operations.
- The default `on` and `off` commands stay terse; use `spotlight-testing status` for the full active-session details.
- Spotlight does not rely on stash-based runtime preservation or protected-file parking.
- The watcher coalesces bursts of changes and processes them serially, closer to `watchexec` than to a naive per-event handler.
- The worktree and target must share the same Git common object database.
