# spotlight-testing

## 0.0.6

### Patch Changes

- Add incremental live sync, per-repo scoped lockfiles for concurrent sessions, and signal handling fixes.

## 0.0.5

### Patch Changes

- Switch to incremental path-scoped syncs during active sessions so unrelated target runtime files are preserved between resyncs; full destructive restore only runs on exit. Fix a second-SIGINT race that caused the process to exit with code 1 during restore cleanup.

## 0.0.4

### Patch Changes

- Use per-repo scoped lockfiles so multiple spotlight sessions can run concurrently on different repositories

## 0.0.3

### Patch Changes

- e7182e1: Refactor checkpoint and sync into unified checkpointer module, improve CLI output formatting, and expand test coverage

## 0.0.2

### Patch Changes

- Convert to Turborepo monorepo and rewrite documentation with CLI-focused README, programmatic API examples, and execution-first AGENTS.md files.
