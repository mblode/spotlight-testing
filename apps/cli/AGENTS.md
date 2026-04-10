# spotlight-testing (CLI)

Checkpoint git worktree changes into a main repo directory for testing with a single Docker environment.

## Commands

- `npm run build` — `tsdown` dual build -> `dist/cli.js` + `dist/index.js`
- `npm run dev` — `tsdown --watch`
- `npm run test` — `vitest run` (48 tests across 8 files)
- `npm run check-types` — `tsc --noEmit`
- `npm run lint` — `oxlint .`
- `spotlight-testing stop [--target <path>] [--remote <name>] [--branch <ref>] [--no-fetch]` — stop spotlight if needed, then reset and clean the target repo

All commands run from repo root via turbo. Direct workspace execution: `cd apps/cli && npx tsdown`.

## Architecture

```
src/
  cli.ts          # Commander entry point (on, off, stop, status)
  index.ts        # Public API exports
  types.ts        # Shared type definitions
  spotlight.ts    # Core orchestration (workspace checkpoint, target checkpoint, watch loop, restore)
  checkpointer.ts # Native TypeScript checkpoint ref save/restore engine
  output.ts       # Clack + chalk output helpers for CLI/session rendering
  watcher.ts      # Serialized file watcher with watchexec-style event coalescing
  git.ts          # Git operations (common-dir, ref management, metadata, busy-state checks)
  lockfile.ts     # Singleton lockfile for concurrent instance prevention
```

## Gotchas

- **ESM only**: `"type": "module"` throughout. Use `.js` extensions in all imports.
- **Dual build**: `tsdown.config.ts` produces two separate entry points -> `cli.js` (with shebang, no .d.ts) and `index.js` (with .d.ts, no shebang). Do not merge them into one build.
- **CLI output**: Use `chalk` for inline emphasis and `@clack/prompts` for structured CLI output, notes, logs, and spinners. Do not add `ora` or raw ANSI strings.
- **Minimal default UX**: Keep `on`, `off`, and `stop` terse. Rich session detail belongs in `spotlight-testing status`, not the default startup flow.
- **Stop vs off**: `off` restores the saved target checkpoint only. `stop` is the aggressive cleanup path that stops spotlight, then resets and cleans the target repo.
- **macOS only**: Spotlight uses recursive watching semantics that match `watchexec`-style behavior. Keep the watcher serialized and event-coalesced.
- **Checkpoint refs**: Workspace state is stored under named refs, not temporary stash entries or ad hoc commits.
- **Target checkpoint**: Spotlight saves the target root at startup and restores it on exit with destructive Git operations.
- **Untracked by default**: Workspace untracked files are included in the checkpoint flow by default, while ignored files stay untouched.
- **Same-repo requirement**: The worktree and target must share the same Git common object database. `checkpointer.ts` assumes shared refs and objects.
- **One-way sync**: Changes in the target directory are not copied back into the worktree.
- **Monorepo workspace**: This package lives at `apps/cli/`. Run all orchestration commands from the repo root.
