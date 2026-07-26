# Architecture & System Boundaries

Key architectural decisions, service boundaries, data flow, integration points, and why things are the way they are.

## Build output filenames are a contract with package.json

`apps/cli/package.json` declares `bin`, `main`, `types`, and `exports` pointing
at unprefixed `dist/cli.js`, `dist/index.js`, and `dist/index.d.ts`. Nothing
derives those paths from the build, so any change to tsdown's output extension
silently breaks every entry point at once — the package installs fine and the
binary is simply missing.

`tsdown.config.ts` therefore pins `fixedExtension: false` on both entries.
tsdown defaults it to `true` when `platform` is `node` (the default), which
emits `.mjs`/`.d.mts`. The package is already `"type": "module"`, so `.js` is
unambiguously ESM and the prefix buys nothing. This bit during the tsdown
0.12 → 0.22 upgrade.

If you change the output extension deliberately, update `bin`, `main`, `types`,
and `exports` in the same commit.

## Verifying the boundary

`npx publint` (via `npx --yes publint` in `apps/cli`) packs the real tarball and
checks every manifest entry point resolves. It catches this entire class of
drift in seconds and is worth running before any release that touched the build
config or dependencies.
