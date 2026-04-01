# spotlight-testing

Checkpoint git worktree changes into a repo root directory for testing with a single Docker environment.

## The Problem

When using git worktrees, Docker Compose uses the directory name as the project name. Running `docker compose up` from `~/Code/project-feature-branch` creates containers named `project-feature-branch-*` that conflict with `project-*`. You end up needing separate databases, ports, and docker networks for each worktree.

## The Solution

Spotlight creates checkpoint commits from a worktree and checks them out in your main repo directory. You run Docker once from the main directory, and spotlight keeps it up to date with your worktree changes. Hot reload picks up the checked-out checkpoint automatically.

## Installation

```bash
npm install -g spotlight-testing
```

Or use directly with `npx`:

```bash
npx spotlight-testing --help
```

## Usage

```bash
# From inside a linked worktree, infer the main checkout automatically
cd ~/Code/project-feature-branch
spotlight-testing

# Or start explicitly from anywhere
spotlight-testing on ~/Code/project-feature-branch --target ~/Code/project

# Check status
spotlight-testing status

# Stop and restore the main directory
spotlight-testing off
```

### Commands

| Command                           | Description                                      |
| --------------------------------- | ------------------------------------------------ |
| `spotlight-testing`               | Start spotlight from the current linked worktree |
| `spotlight-testing on <worktree>` | Start checkpointing worktree changes into target |
| `spotlight-testing off`           | Stop spotlight and restore target directory      |
| `spotlight-testing status`        | Show current spotlight state                     |

### Options for `spotlight-testing on`

| Option                        | Default            | Description                                |
| ----------------------------- | ------------------ | ------------------------------------------ |
| `-t, --target <path>`         | Auto / current dir | Target directory to checkpoint into        |
| `-p, --protect <patterns...>` | —                  | Additional file patterns to never sync     |
| `-d, --debounce <ms>`         | 300                | Debounce interval for file watcher         |
| `--include-untracked`         | Off                | Include untracked files in checkpoint sync |

When you run `spotlight-testing` or `spotlight-testing on` without a `<worktree>` argument from inside a linked worktree, Spotlight infers the primary checkout as the target. When you pass `<worktree>` explicitly, the target still defaults to the current directory unless you override it with `--target`.

If Spotlight is already running, starting it again replaces the active process. The existing process gets a `SIGTERM`, restores the target checkout, and then the new process takes over.

### Protected Files

These files are never synced, regardless of git tracking status:

- `.env`, `.env.local`, `.env.chamber`, `.env.ngrok`

Protected files are parked out of the target working tree during checkpoint checkout and then restored, so target-local secrets can intentionally differ from the worktree.

## How It Works

Spotlight works only when the worktree and target share the same Git object database, which is true for linked worktrees from the same repository. While spotlight is running, the target is typically left in detached `HEAD` at the current checkpoint commit.

At a high level:

1. Save the target's original `HEAD` state.
2. Park target-local protected files such as `.env*`.
3. Create a checkpoint commit from the worktree.
4. Check out that checkpoint in the target repository.
5. Restore protected files.
6. Repeat on file changes.
7. Restore the original target `HEAD` state on exit.

## Programmatic API

```typescript
import { spotlight, syncOnce, restore } from "spotlight-testing";

// One-shot sync
const result = syncOnce("/path/to/worktree", "/path/to/target");
console.log(`Checkpoint ${result.commitSha} changed ${result.synced} paths`);

// Watch mode
spotlight({
  worktree: "/path/to/worktree",
  target: "/path/to/target",
  protect: ["custom-local-file.json"],
  debounce: 500,
});
```

## Usage with AI Agents

Add the skill to your AI coding assistant:

```bash
npx skills add mblode/spotlight-testing
```

This works with Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot, Goose, OpenCode, and Windsurf.

## Requirements

- Node.js >= 22
- macOS (the current watcher relies on `fs.watch({ recursive: true })` via FSEvents)

## License

[MIT](LICENSE.md)
