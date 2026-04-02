---
title: Using spotlight testing
source: "https://docs.conductor.build/guides/spotlight-testing"
type: web
siteName: Conductor
date: "2026-03-31T22:20:54.755Z"
---

# Using spotlight testing

Use spotlight testing to test your workspace changes in your repository's root directory.

![Spotlight testing](https://mintcdn.com/conductor-7a9c6b47/EyESeSTp_x0b2ktg/images/spotlight-btn.png?fit=max&auto=format&n=EyESeSTp_x0b2ktg&q=85&s=fff4ad07b9384f32b75717e2c7dff727)

## Enabling spotlight testing

Spotlight testing is experimental. To enable it, go to `Settings` -> `Experimental` and toggle on "Use spotlight testing".

If you run into any issues, please reach out to us at [humans@conductor.build](mailto:humans@conductor.build)!

## Spotlighting a workspace

When you have changes ready to test in a workspace, use the spotlight button in the Conductor UI to apply your workspace changes in your repository's root directory.

You'll then have access to a terminal in your repository root directory in the Conductor UI. Use this terminal to test your application.

When you turn spotlight mode off, your original state in your repository root will be restored.

Spotlight saves a checkpoint of the repository root when spotlight starts, then restores that checkpoint when spotlight ends. The workspace checkpoint and the target-root checkpoint are separate refs, so tracked files, non-ignored untracked files, and the index return to their startup state.

![Spotlight testing](https://mintcdn.com/conductor-7a9c6b47/EyESeSTp_x0b2ktg/images/spotlight.gif?s=e8d1f0ddf6c32f3f91f45631c46fff85)

"Repository root" refers to the directory of the repository that you added to Conductor.

## Hot reloading

Enabling spotlight mode adds a file watcher to your workspace. Whenever changes are detected, Conductor creates a named checkpoint ref from your workspace and restores it into your repository root.

The watcher behaves like a serialized event queue: rapid bursts of changes are coalesced into the next sync cycle instead of triggering overlapping checkouts.

If your development server supports hot reloading, you'll see workspace changes reflected without having to take any manual action.

## Why use spotlight?

Spotlight testing is a great fit for:

- **Directory-dependent applications** - Spotlight runs your app in your repository's root directory, so you don't have to build workarounds if your application has assumptions about what directory on a machine it runs from.
- **Long initial builds** - If your first build takes a long time but subsequent incremental builds are fast, spotlight testing enables reuse of build artifacts that already exist by running from one location.
- **External resource dependencies** - If your app depends on a single external resource (like a database or a specific port), spotlight testing leverages your existing resource setups in the repository root.

## Frequently asked questions

### How does Spotlight testing work?

Spotlight testing works by creating checkpoint refs from your workspace and restoring them into your repository root directory.

By default, spotlight includes untracked files in the workspace checkpoint so the target directory matches the workspace more closely.

If your repository root already has local changes, Spotlight captures the root state at startup and restores it when Spotlight stops. That restore is destructive and uses Git operations equivalent to a hard reset plus tree and index restoration. Ignored files are left in place rather than checkpointed or rolled back.

### Why aren't changes in my repository root directory reflected in my workspace?

Spotlight testing is a one-way sync. Changes in your repository root directory are not copied to your workspace. Only changes in your workspace are copied to your repository root directory.

We recommend editing changes in your workspace directly to see them reflected in your repository root directory.

### How can I fix a "Cannot start Spotlight" error?

If your workspace or repository root have a rebase, merge, cherry-pick, or revert in progress, Spotlight mode will not work.

You can fix this by completing or aborting the operation before starting Spotlight.

Make sure you run the command in your workspace and repository root directories.
