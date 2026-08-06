<div align="center">

# Spotlight Testing

**Run a git worktree's changes inside your main checkout, so you never build a second dev environment**

Edit in the worktree and Spotlight keeps the repo root in sync, then puts the root back exactly as it was when you stop.

<p align="center">
  <a href="https://www.npmjs.com/package/spotlight-testing">
    <img src="https://img.shields.io/npm/v/spotlight-testing?style=flat&colorA=000000&colorB=000000" />
  </a>
  <a href="https://github.com/mblode/spotlight-testing/blob/main/LICENSE.md">
    <img src="https://img.shields.io/github/license/mblode/spotlight-testing?style=flat&colorA=000000&colorB=000000" />
  </a>
</p>

</div>

## Install

```bash
npm install -g spotlight-testing
```

## Quickstart

Run it from inside a linked worktree. Spotlight infers the main checkout, saves its current state, and starts syncing.

```bash
spotlight-testing
```

Your slow Docker or database setup keeps running in the repo root while you work in the worktree. When you are done:

```bash
# Restore the repo root to how it was before spotlight started
spotlight-testing off

# Or realign it with the remote instead
spotlight-testing reset
```

## Commands

| Command                    | Description                                                       |
| -------------------------- | ----------------------------------------------------------------- |
| `spotlight-testing`        | Start syncing the current worktree, the same as `on`              |
| `spotlight-testing on`     | Start syncing an explicit worktree path                           |
| `spotlight-testing off`    | Stop, and restore the checkpoint saved when spotlight started     |
| `spotlight-testing reset`  | Stop if needed, then fetch and hard-reset the root to `origin/main`|
| `spotlight-testing status` | Show which worktree is currently spotlit, and where               |

## Options

| Flag                  | Default        | Description                                        |
| --------------------- | -------------- | -------------------------------------------------- |
| `-t, --target <path>` | inferred       | Repo root to sync into or reset, for `on` and `reset` |
| `-d, --debounce <ms>` | `300`          | How long file events are coalesced before a sync    |
| `-r, --remote <name>` | `origin`       | Remote that `reset` fetches from                   |
| `--to <ref>`          | `origin/main`  | Ref that `reset` moves the repo root to            |
| `--no-fetch`          |                | Skip the fetch before `reset`                      |

## Notes

- Node.js 24 or newer, on macOS.
- The worktree and the repo root have to share one git object store, so a linked `git worktree` rather than a second clone.
- Syncing and restoring both use destructive git operations on the repo root. Anything uncommitted there is captured in the startup checkpoint and comes back on `off`.
- Untracked files in the worktree are included by default. Ignored files are left untouched.
- Checkpoints are git refs under `refs/conductor-checkpoints/`, so nothing lands in your history.

## License

MIT

---

Crafted by [<img src="https://blode.co/avatar-circle.png" width="20" align="top" />](https://blode.co) [Matthew Blode](https://blode.co)
