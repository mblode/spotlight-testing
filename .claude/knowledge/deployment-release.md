# Deployment & Release

How code gets to production. Release processes, environment promotion, rollback procedures, gotchas.

## Release flow

Releases go through changesets in CI, not locally. Push a commit containing a
`.changeset/*.md` file to `main`; the Release workflow opens or updates the
"Version Packages" PR on branch `changeset-release/main`. Merging that PR
re-runs the same workflow, which publishes to npm via OIDC trusted publishing.

Never run `changeset version` or `npm publish` locally. Several releases up to
0.0.8 were cut that way, which left the bot's Version Packages PR (#3) stale for
multiple versions and meant the CI release path was never exercised — so the
bugs below all surfaced at once on the first real run.

## Gotchas

- **Git hooks must stay disabled in the release job.** `npm ci` runs the root
  `prepare` script, which installs lefthook. Without `LEFTHOOK: "0"` on the
  release job, the changesets bot's `git commit -m "Version Packages"` fires
  pre-commit; ultracite then exits 1 because the staged `CHANGELOG.md` and
  `package.json` match the hook's glob but contain nothing oxlint can lint.
- **`changeset status` must skip `changeset-release/main`.** That PR exists to
  consume changesets, so the check can never pass there and will block every
  release. `ci.yml` guards it with `github.head_ref != 'changeset-release/main'`.
- **The bot PR's CI needs manual approval.** Runs on `changeset-release/main`
  land in `action_required` because the PR author is a bot. Approve with
  `gh api -X POST repos/mblode/spotlight-testing/actions/runs/<id>/approve`.
  Pushing to `main` rebases the PR, which requires a fresh approval each time.
- **Keep workflow Node in step with `engines`.** Both workflows pin
  `node-version`, and the CLI declares `engines.node >= 24`. They drifted once
  (CI on 22 against engines `>=24`), testing a version the package declares
  unsupported.

## Verifying a release

`npm view <pkg> version` only proves the manifest published. To prove the
package actually works, pack it and run the binary:

```sh
npm pack spotlight-testing@<version> && tar -tzf spotlight-testing-<version>.tgz | grep dist/
npx --yes spotlight-testing@<version> --version
```

This catches entry-point drift (see `architecture-boundaries.md`), which a
green `npm view` will happily hide.
