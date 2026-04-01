# spotlight-testing

Checkpoint git worktree changes into a main repo directory for testing with a single Docker environment.

## Commands

```bash
npm install              # setup from repo root (requires Node >= 22)
npm run build            # turbo → tsdown → dist/
npm run dev              # turbo → tsdown --watch
npm run test             # turbo → vitest run
npm run check-types      # turbo → tsc --noEmit
npm exec -- ultracite fix   # format + lint autofix (from root)
npm exec -- ultracite check # lint check (from root)
```

## Architecture

```
src/
  cli.ts              # Commander entry point (on, off, status commands)
  index.ts            # Public API exports
  types.ts            # Shared type definitions
  spotlight.ts        # Core orchestration (checkpoint apply, state save/restore, watch loop)
  checkpoint.ts       # Git checkpoint creation from worktree state
  sync.ts             # Checkpoint apply helpers and protected-file parking
  watcher.ts          # fs.watch recursive wrapper with debounce
  git.ts              # Git operations (common-dir, checkout, stash, branch)
  protect.ts          # Protected-file matching helpers
  lockfile.ts         # Singleton lockfile to prevent concurrent instances
```

## How It Works

1. Verifies the worktree and target share the same Git object database.
2. Saves the target directory's original `HEAD` state.
3. Parks protected files such as `.env*` out of the target working tree.
4. Creates a checkpoint commit from the worktree and checks it out in the target.
5. Watches the worktree with `fs.watch({ recursive: true })`.
6. On changes, creates a new checkpoint and checks it out in the target.
7. On exit (Ctrl+C), restores the original target `HEAD` state and protected files.

## Gotchas

- **ESM only**: This project uses `"type": "module"`. Use `.js` extensions in imports.
- **Dual build**: `tsdown.config.ts` produces two entry points — `cli.js` (with shebang) and `index.js` (with .d.ts). Do not merge them.
- **Linting via ultracite**: Run `npm exec -- ultracite fix` instead of calling oxlint or oxfmt directly.
- **Git hooks via ultracite**: Ultracite sets up lefthook for pre-commit hooks. Run `npx ultracite init` after cloning.
- **No chalk/ora**: Use `import { styleText } from "node:util"` for colors and `@clack/prompts` spinner for progress.
- **macOS only for now**: `fs.watch({ recursive: true })` relies on FSEvents. Linux support needs a polling fallback.
- **Protected files**: `.env`, `.env.chamber`, `.env.ngrok`, `.env.local` are parked and restored on every checkpoint checkout.
- **Tracked-only default**: Untracked files are excluded unless `--include-untracked` is passed.
- **Same-repo requirement**: The worktree and target must share the same Git common object database.
- **Detached HEAD**: The target is typically left detached while spotlight is active.
- **Monorepo**: This is a Turborepo workspace at `apps/cli/`. Run commands from the repo root.
