# Spotlight Testing

Test your worktree changes in the repo root without rebuilding your whole setup.

Useful when your first build is slow, your dev environment depends on a shared Docker or database setup, or you just don't want to spin up another full environment.

## Install

```bash
npm install -g spotlight-testing
```

Requires Node.js 22+ and macOS.

## Usage

Start from inside a linked worktree:

```bash
spotlight-testing
```

Pass the repo root explicitly if needed:

```bash
spotlight-testing on --target ../my-repo
```

Stop and restore:

```bash
spotlight-testing off
```

Check status:

```bash
spotlight-testing status
```

Edits go in the worktree, testing happens in the repo root. When you stop, the repo root goes back to how it was before.

## License

[MIT](apps/cli/LICENSE.md)
