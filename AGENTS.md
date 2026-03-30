# spotlight-testing

Sync git worktree changes into a main repo directory for testing with a single Docker environment.

## Commands

```bash
npm install              # setup (requires Node >= 22)
npm run build            # tsdown → dist/
npm run dev              # tsdown --watch
npm run test             # vitest run
npm run typecheck        # tsc --noEmit
npm exec -- ultracite fix   # format + lint autofix
npm exec -- ultracite check # lint check (CI)
```

## Architecture

```
src/
  cli.ts              # Commander entry point (on, off, status commands)
  index.ts            # Public API exports
  types.ts            # Shared type definitions
  spotlight.ts        # Core orchestration (state save/restore, watch loop)
  sync.ts             # File sync via rsync --files-from
  watcher.ts          # fs.watch recursive wrapper with debounce
  git.ts              # Git operations (ls-files, stash, branch)
  lockfile.ts         # Singleton lockfile to prevent concurrent instances
```

## How It Works

1. Saves target directory state (git stash if dirty)
2. Gets git-tracked files from the worktree via `git ls-files`
3. Syncs them into the target directory via `rsync --files-from`
4. Watches the worktree with `fs.watch({ recursive: true })`
5. On changes, re-syncs and handles file deletions
6. On exit (Ctrl+C), restores target to original state

## Gotchas

- **ESM only**: This project uses `"type": "module"`. Use `.js` extensions in imports.
- **Dual build**: `tsdown.config.ts` produces two entry points — `cli.js` (with shebang) and `index.js` (with .d.ts). Do not merge them.
- **Linting via ultracite**: Run `npm exec -- ultracite fix` instead of calling oxlint or oxfmt directly.
- **Git hooks via ultracite**: Ultracite sets up lefthook for pre-commit hooks. Run `npx ultracite init` after cloning.
- **No chalk/ora**: Use `import { styleText } from "node:util"` for colors and `@clack/prompts` spinner for progress.
- **macOS only for now**: `fs.watch({ recursive: true })` relies on FSEvents. Linux support needs a polling fallback.
- **Protected files**: `.env`, `.env.chamber`, `.env.ngrok`, `.env.local` are never synced regardless of git tracking status.
- **Requires rsync**: Uses the system `rsync` binary for efficient file copying.
