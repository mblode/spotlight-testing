# spotlight-testing

Sync git worktree changes into a repo root for testing with a single Docker environment.

## Packages

| Package | Description | Version |
|---------|-------------|---------|
| [`spotlight-testing`](apps/cli) | CLI and programmatic API for checkpoint-based worktree sync | [![npm](https://img.shields.io/npm/v/spotlight-testing.svg)](https://www.npmjs.com/package/spotlight-testing) |

## Getting Started

```bash
git clone https://github.com/mblode/spotlight-testing.git
cd spotlight-testing
npm install
npm run build
```

Requires Node.js 22+.

## Development

```bash
npm run build         # Build all packages
npm run dev           # Watch mode
npm run test          # Run all tests
npm run check-types   # Type check all packages
npm run lint          # Lint all packages
npm run format        # Format all packages
```

## Release

This project uses [changesets](https://github.com/changesets/changesets) for versioning and OIDC trusted publishing for npm releases.

```bash
npx changeset         # Create a changeset
```

Merging to `main` triggers the release workflow automatically.

## License

[MIT](apps/cli/LICENSE.md)
