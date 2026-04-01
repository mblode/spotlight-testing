# spotlight-testing (CLI)

Checkpoint git worktree changes into a main repo directory for testing with a single Docker environment.

## Commands

- `npm run build` — `tsdown` dual build → `dist/cli.js` + `dist/index.js`
- `npm run dev` — `tsdown --watch`
- `npm run test` — `vitest run` (22 tests across 7 files)
- `npm run check-types` — `tsc --noEmit`
- `npm run lint` — `oxlint .`

All commands run from repo root via turbo. Direct workspace execution: `cd apps/cli && npx tsdown`.

## Architecture

```
src/
  cli.ts          # Commander entry point (on, off, status)
  index.ts        # Public API exports
  types.ts        # Shared type definitions
  spotlight.ts    # Core orchestration (checkpoint, watch loop, restore)
  checkpoint.ts   # Git checkpoint creation from worktree state
  sync.ts         # Checkpoint apply + protected-file parking
  watcher.ts      # fs.watch recursive wrapper with debounce
  git.ts          # Git operations (common-dir, checkout, stash, branch)
  protect.ts      # Protected-file matching helpers
  lockfile.ts     # Singleton lockfile for concurrent instance prevention
```

## Gotchas

- **ESM only**: `"type": "module"` throughout. Use `.js` extensions in all imports.
- **Dual build**: `tsdown.config.ts` produces two separate entry points — `cli.js` (with shebang, no .d.ts) and `index.js` (with .d.ts, no shebang). Do not merge them into one build.
- **No chalk/ora**: Use `import { styleText } from "node:util"` for colors and `@clack/prompts` spinner for progress.
- **macOS only**: `fs.watch({ recursive: true })` relies on FSEvents. Linux support needs a polling fallback.
- **Protected files**: `.env`, `.env.chamber`, `.env.ngrok`, `.env.local` are parked out and restored on every checkpoint checkout. Add custom patterns with `--protect`.
- **Dirty target safety**: `spotlight-testing on` auto-stashes target changes, including untracked files, before detached checkout and restores them on exit. `syncOnce()` still requires a clean target.
- **Tracked-only default**: Untracked files are excluded unless `--include-untracked` is passed.
- **Same-repo requirement**: The worktree and target must share the same Git common object database. `checkpoint.ts` validates this before syncing.
- **Detached HEAD**: The target is left in detached HEAD while spotlight is active. Original state is restored on exit.
- **Monorepo workspace**: This package lives at `apps/cli/`. Run all orchestration commands from the repo root.
