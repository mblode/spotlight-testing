# Testing Patterns

Testing strategies, test infrastructure quirks, how to run/debug specific test suites, mocking conventions.

## The e2e suite is macOS-only

`test/cli-e2e.test.ts` is wrapped in `describe.skipIf(process.platform !== "darwin")`,
so the Linux `build` job silently skips all 11 tests. Only the `macos-smoke` job
exercises them. When a change passes `build` but fails `macos-smoke`, the tests
did not "start failing on macOS" — they are the only place they ran at all.

This suite is also the only thing that verifies the built CLI is launchable, so
it is the de facto guard against `package.json` entry points drifting from build
output. Do not assume a green Linux job means the package is installable.

## Fixed flake: "Incompatible spotlight lockfile"

`writeLockfile` in `src/lockfile.ts` used a plain `writeFileSync`, which
truncates before writing. A concurrent reader could observe a partially written
file, fail the JSON parse or shape guard, and throw `Incompatible spotlight
lockfile at <path>` — an intermittent e2e failure unrelated to the change under
test. Fixed in 0.0.10 by writing to a sibling temp file and `renameSync`-ing
over the target, which is atomic within a filesystem.

The regression test asserts the inode changes across writes rather than racing
threads, since a timing-based test for this would itself be flaky. If you
change the write path, keep that guarantee: any in-place write reopens the race.

## Timeouts mean the CLI never started

`waitFor` throws a generic `Timed out waiting for CLI state` after 30s. When
every test in the file times out at once, the cause is almost never the tests —
it is that `dist/cli.js` does not exist or cannot execute, so the spawned
process produced no output. Check `ls apps/cli/dist/` against the `bin` field
before debugging any individual assertion.

## Running

- Full suite from root: `npm run test` (turbo). Takes ~5 min, dominated by e2e.
- Single file: `cd apps/cli && npx vitest run test/<file>.test.ts`.
- Turbo buffers output, so a backgrounded `npm run test` may show nothing until
  it finishes; run vitest directly when you need streaming output.
