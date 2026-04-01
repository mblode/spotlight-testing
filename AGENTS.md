# spotlight-testing (monorepo)

Turborepo monorepo for spotlight-testing — checkpoint git worktree changes for testing.

## Structure

```
apps/cli/    # The spotlight-testing CLI and library (publishable)
```

## Commands

```bash
npm install              # setup (requires Node >= 22)
npm run build            # turbo build
npm run dev              # turbo dev
npm run test             # turbo test
npm run check-types      # turbo check-types
npm exec -- ultracite fix   # format + lint autofix
npm exec -- ultracite check # lint check (CI)
```

## Release

Uses changesets with OIDC trusted publishing. See `apps/cli/AGENTS.md` for CLI-specific docs.
