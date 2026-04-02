# spotlight-testing

Run your worktree changes in the repo root, without rebuilding your whole setup from scratch.

## Why

Use `spotlight-testing` when your app only really works from the repo root.

It helps when your first build is slow, your dev setup depends on one shared Docker or database setup, or you want to test worktree changes without spinning up another full environment.

## How

`spotlight-testing` creates checkpoint refs from your worktree and restores them into the repo root.

It watches for changes and updates the repo root on save, so hot reload can keep doing its job.

It is one-way: edit in the worktree, test in the repo root.

When you stop, it restores the repo root to the state it had before Spotlight started. Tracked, staged, and untracked changes in the repo root are captured in that restore checkpoint and brought back on exit. Ignored files stay untouched.

## What

Install:

```bash
npm install -g spotlight-testing
```

Requires Node.js 22+ and macOS.

Start from inside a linked worktree:

```bash
spotlight-testing
```

If Spotlight cannot infer the repo root, pass it explicitly:

```bash
spotlight-testing on --target ../my-repo
```

Stop and restore the repo root:

```bash
spotlight-testing off
```

Check whether Spotlight is running:

```bash
spotlight-testing status
```

`spotlight-testing on` and `spotlight-testing off` stay quiet by default. Run `spotlight-testing status` when you need the detailed active-session view.

Untracked, non-ignored files in the worktree are included in checkpoint sync by default. There is no stash-based preserve flow and no `--protect` or `--include-untracked` flag.

## License

[MIT](apps/cli/LICENSE.md)
