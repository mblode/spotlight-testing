---
name: spotlight
description: Sync git worktree changes into a main repo directory for testing with a single Docker environment. Use when the user wants to use spotlight, run spotlight commands, or asks about spotlight-testing features.
---

# spotlight-testing

Sync git worktree changes into a main repo directory for testing with a single Docker environment.

## Commands

| Command                               | What it does                                         |
| ------------------------------------- | ---------------------------------------------------- |
| `spotlight on <worktree>`             | Start syncing worktree changes into target directory |
| `spotlight on <worktree> -t <target>` | Sync into a specific target directory                |
| `spotlight off`                       | Stop spotlight and restore target directory          |
| `spotlight status`                    | Show current spotlight state                         |
| `spotlight --help`                    | Show available commands and options                  |
| `spotlight --version`                 | Show version number                                  |
