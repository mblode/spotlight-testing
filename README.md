# spotlight-testing

Sync git worktree changes into a main repo directory for testing with a single Docker environment.

## The Problem

When using git worktrees, Docker Compose uses the directory name as the project name. Running `docker compose up` from `~/Code/project-feature-branch` creates containers named `project-feature-branch-*` that conflict with `project-*`. You end up needing separate databases, ports, and docker networks for each worktree.

## The Solution

Spotlight syncs git-tracked files from a worktree into your main repo directory. You run Docker once from the main directory, and spotlight keeps it up to date with your worktree changes. Hot reload picks up the synced files automatically.

## Installation

```bash
npm install -g spotlight-testing
```

Or use directly with npx:

```bash
npx spotlight-testing --help
```

## Usage

```bash
# Start syncing a worktree into the main repo
spotlight on ~/Code/project-feature-branch --target ~/Code/project

# Check status
spotlight status

# Stop and restore the main directory
spotlight off
```

### Commands

| Command | Description |
|---------|-------------|
| `spotlight on <worktree>` | Start syncing worktree changes into target |
| `spotlight off` | Stop spotlight and restore target directory |
| `spotlight status` | Show current spotlight state |

### Options for `spotlight on`

| Option | Default | Description |
|--------|---------|-------------|
| `-t, --target <path>` | Current directory | Target directory to sync into |
| `-p, --protect <patterns...>` | — | Additional file patterns to never sync |
| `-d, --debounce <ms>` | 300 | Debounce interval for file watcher |
| `--no-untracked` | — | Exclude untracked files from sync |

### Protected Files

These files are never synced, regardless of git tracking status:

- `.env`, `.env.local`, `.env.chamber`, `.env.ngrok`

## Programmatic API

```typescript
import { spotlight, syncOnce, restore } from "spotlight-testing"

// One-shot sync
const result = syncOnce("/path/to/worktree", "/path/to/target")
console.log(`Synced ${result.synced} files, deleted ${result.deleted}`)

// Watch mode
await spotlight({
  worktree: "/path/to/worktree",
  target: "/path/to/target",
  protect: ["custom-local-file.json"],
  debounce: 500,
})
```

## Usage with AI Agents

Add the skill to your AI coding assistant:

```bash
npx skills add mblode/spotlight-testing
```

This works with Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot, Goose, OpenCode, and Windsurf.

## Requirements

- Node.js >= 22
- rsync (pre-installed on macOS and most Linux)
- macOS (for `fs.watch` recursive support) or Linux with Node 22+

## License

[MIT](LICENSE.md)
