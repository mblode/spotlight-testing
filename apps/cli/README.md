<h1 align="center">spotlight-testing</h1>

<p align="center">Sync git worktree changes into a repo root for testing with a single Docker environment.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/spotlight-testing"><img src="https://img.shields.io/npm/v/spotlight-testing.svg" alt="npm version"></a>
  <a href="LICENSE.md"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
</p>

- **Checkpoint sync:** Creates temporary commits from your worktree and checks them out in the target directory.
- **File watching:** Detects changes with `fs.watch` and re-syncs automatically on save.
- **Protected files:** Keeps `.env`, `.env.local`, and other sensitive files untouched in the target.
- **Clean restore:** Returns the target to its original branch and HEAD state on exit.
- **Programmatic API:** Use `spotlight()`, `syncOnce()`, and `restore()` directly from Node.js.

## Install

```bash
npm install -g spotlight-testing
```

Requires Node.js 22+. macOS only (relies on FSEvents for recursive file watching).

## Usage

Run from inside a git worktree. The target directory is inferred automatically:

```bash
spotlight-testing
```

Explicitly set the worktree and target:

```bash
spotlight-testing on ./feature-branch --target ./main-repo
```

Protect additional files from being overwritten:

```bash
spotlight-testing on --protect "docker-compose.override.yml" "*.local"
```

Include untracked files in the sync:

```bash
spotlight-testing on --include-untracked
```

Stop syncing and restore the target:

```bash
spotlight-testing off
```

Check the current sync status:

```bash
spotlight-testing status
```

## Options

```
Usage: spotlight-testing on [options] [worktree]

Arguments:
  worktree                     Path to the git worktree to sync from

Options:
  -t, --target <path>          Target directory to sync into
  -p, --protect <patterns...>  Additional file patterns to never sync
  -d, --debounce <ms>          Debounce interval in milliseconds (default: 300)
  --include-untracked          Include untracked files in checkpoint sync
  -h, --help                   display help for command
```

## API

```typescript
import { spotlight, syncOnce, restore } from "spotlight-testing";

// Watch and sync continuously
spotlight({
  worktree: "/path/to/feature-branch",
  target: "/path/to/main-repo",
  protect: [".env*"],
  debounce: 300,
});

// One-shot sync
const result = await syncOnce({
  worktree: "/path/to/feature-branch",
  target: "/path/to/main-repo",
});

// Restore the target to its original state
restore("/path/to/main-repo");
```

## How It Works

1. Verifies the worktree and target share the same Git object database.
2. Saves the target directory's original HEAD state.
3. Parks protected files (`.env*`) out of the target working tree.
4. Creates a checkpoint commit from the worktree and checks it out in the target.
5. Watches the worktree for changes with `fs.watch({ recursive: true })`.
6. On each change, creates a new checkpoint and checks it out in the target.
7. On exit (Ctrl+C), restores the original HEAD state and protected files.

## Requirements

- Node.js 22+
- macOS (FSEvents required for recursive `fs.watch`)
- Worktree and target must share the same Git common object database

## License

[MIT](LICENSE.md)
