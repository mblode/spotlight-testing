<h1 align="center">spotlight-testing</h1>

<p align="center">Sync git worktree changes into a repo root for testing with a single Docker environment.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/spotlight-testing"><img src="https://img.shields.io/npm/v/spotlight-testing.svg" alt="npm version"></a>
  <a href="LICENSE.md"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
</p>

- **Checkpoint refs:** Captures workspace state into named Git checkpoint refs and applies them to the target directory.
- **Path-scoped incremental sync:** Replays only changed paths into the target after startup, then uses a full checkpoint restore on exit.
- **Untracked by default:** Workspace untracked files are included in checkpoints, while ignored files stay in the target.
- **Watchexec-style watching:** Serializes file events and coalesces bursts of changes into a single follow-up sync.
- **Programmatic API:** Use `spotlight()`, `syncOnce()`, and `restore()` directly from Node.js.

## Install

```bash
npm install -g spotlight-testing
```

Requires Node.js 22+. macOS only.

## Usage

Run from inside a git worktree. The target directory is inferred automatically:

```bash
spotlight-testing
```

Pass a linked worktree path from anywhere. The main checkout is still inferred automatically:

```bash
spotlight-testing on ./feature-branch
```

Explicitly set both worktree and target:

```bash
spotlight-testing on ./feature-branch --target ./main-repo
```

Stop syncing and restore the target:

```bash
spotlight-testing off
```

Stop spotlight if needed, then reset and clean the target repo:

```bash
spotlight-testing stop --branch main
```

Check the current sync status:

```bash
spotlight-testing status
```

`on`, `off`, and `stop` keep default output minimal. Use `status` when you need the full active-session details.

## Target State

`spotlight-testing on` checkpoints the target root before spotlight starts. That checkpoint is restored when spotlight stops, so tracked files, non-ignored untracked files, and the index return to their startup state.

`spotlight-testing stop` is the more aggressive cleanup path. It stops Spotlight if it is active, restores the saved checkpoint when one exists, then optionally fetches, hard-resets to the requested ref, and runs `git clean -fd` so the target matches that ref except for ignored files.

Workspace changes are synced into the target through named Git checkpoint refs. After startup Spotlight replays only the changed paths into the target worktree, which keeps unrelated runtime files stable while still mirroring ongoing worktree edits.

Checkpoint restore is destructive only when spotlight stops. At shutdown the target is rewritten from the saved checkpoint using Git operations equivalent to `reset --hard`, `read-tree -u`, and `clean -fd`, followed by restoration of the saved index tree. Ignored files are left in place rather than checkpointed or rolled back.

`syncOnce()` follows the same checkpoint model in a one-shot destructive pass.

## Options

```
Usage: spotlight-testing on [options] [worktree]

Arguments:
  worktree                     Path to the git worktree to sync from

Options:
  -t, --target <path>          Target directory to sync into
  -d, --debounce <ms>          Debounce interval in milliseconds (default: 300)
  -h, --help                   display help for command
```

## API

```typescript
import { spotlight, syncOnce, restore } from "spotlight-testing";

// Watch and sync continuously
spotlight({
  worktree: "/path/to/feature-branch",
  target: "/path/to/main-repo",
  debounce: 300,
});

// One-shot sync
const result = syncOnce("/path/to/feature-branch", "/path/to/main-repo");

// Restore the target to its original state
restore("/path/to/main-repo");
```

## How It Works

1. Verifies the worktree and target share the same Git object database.
2. Saves a checkpoint of the target root before spotlight starts.
3. Creates a named checkpoint ref from the worktree.
4. Replays only the changed workspace paths into the target worktree during incremental sync.
5. Watches the worktree with a serialized change queue that behaves like `watchexec`.
6. Coalesces bursts of changes into the next checkpoint/restore cycle.
7. On exit, restores the saved target-root checkpoint with a full destructive restore.

## Requirements

- Node.js 22+
- macOS
- Worktree and target must share the same Git common object database

## License

[MIT](LICENSE.md)
