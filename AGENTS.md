# spotlight-testing

Turborepo monorepo for worktree-based checkpoint sync.

## Commands

- `npm install` — Install all workspaces (run from root)
- `npm run build` — Build all packages via turbo
- `npm run dev` — Watch mode via turbo
- `npm run test` — Run all tests via turbo
- `npm run check-types` — Type check all packages via turbo
- `npm exec -- ultracite fix` — Format + lint autofix
- `npm exec -- ultracite check` — Lint check (CI)
- `npm run knip` — Run the unused-code and unused-export scan
- `npx changeset` — Create a changeset before release

## Scope

- Root file: shared monorepo rules only
- `apps/cli/AGENTS.md`: CLI-specific commands, architecture, and gotchas

## Available Context

Additional context is available in the files below. Consult the relevant file when working in a related area — see each description for scope.

- `.claude/knowledge/deployment-release.md` — Release process, changesets CI flow, publish gotchas
- `.claude/knowledge/testing-patterns.md` — macOS-only e2e suite, known flakes, how to run suites
- `.claude/knowledge/architecture-boundaries.md` — Build output ↔ package.json entry-point contract

## Cross-Workspace Gotchas

- **Turbo delegates everything**: Root scripts call `turbo <task>`. Never run build/test/lint commands directly from root — turbo handles workspace resolution.
- **Linting via ultracite**: Run `npm exec -- ultracite fix` from root, not `oxlint` directly. Ultracite coordinates oxlint + oxfmt + lefthook.
- **packageManager field required**: Turbo requires the `packageManager` field in root `package.json`. Do not remove it.
- **Changesets at root**: `npx changeset` and release scripts run from root. Individual workspaces do not have changeset scripts.
