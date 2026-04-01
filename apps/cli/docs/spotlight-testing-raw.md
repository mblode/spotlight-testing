---
title: Using spotlight testing
source: "https://docs.conductor.build/guides/spotlight-testing.md"
type: web
siteName: Conductor
date: "2026-03-31T22:21:06.349Z"
---

> ## Documentation Index
>
> Fetch the complete documentation index at: https://docs.conductor.build/llms.txt
> Use this file to discover all available pages before exploring further.

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

If your repository root already has local changes, Spotlight preserves them by stashing them in the target repository before checkout and restoring that stash when spotlight mode ends.

![Spotlight testing](https://mintcdn.com/conductor-7a9c6b47/EyESeSTp_x0b2ktg/images/spotlight.gif?s=e8d1f0ddf6c32f3f91f45631c46fff85)

"Repository root" refers to the directory of the repository that you added to Conductor.

## Hot reloading

Enabling spotlight mode adds a file watcher to your workspace. Whenever changes are detected, Conductor will create a [checkpoint](/core/checkpoints) commit of your workspace and check it out in your repository root.

If your development server supports hot reloading, you'll see workspace changes reflected without having to take any manual action.

## Why use spotlight?

Spotlight testing is a great fit for:

- **Directory-dependent applications** - Spotlight runs your app in your repository's root directory, so you don't have to build workarounds if your application has assumptions about what directory on a machine it runs from.
- **Long initial builds** - If your first build takes a long time but subsequent incremental builds are fast, spotlight testing enables reuse of build artifacts that already exist by running from one location.
- **External resource dependencies** - If your app depends on a single external resource (like a database or a specific port), spotlight testing leverages your existing resource setups in the repository root.

## Frequently asked questions

### How does Spotlight testing work?

Spotlight testing works by creating checkpoint commits from your workspace and checking them out in your repository root directory.

_Only_ files that are tracked in git are synced back to your repository root directory by default. That means build artifacts (like `node_modules`) are not copied back to your repository root directory unless Spotlight explicitly includes them.

If your repository root already has local changes, Spotlight preserves them by creating a temporary stash in the target repository before checkout and restoring it when Spotlight stops.

### Why aren't changes in my repository root directory reflected in my workspace?

Spotlight testing is a one-way sync. Changes in your repository root directory are not copied to your workspace. Only changes in your workspace are copied to your repository root directory.

We recommend editing changes in your workspace directly to see them reflected in your repository root directory.

### How can I fix a "Cannot start Spotlight" error?

If your workspace or repository root have a rebase or merge in progress, Spotlight mode will not work.

You can fix this by running `git rebase --continue` or `git merge --continue` to complete the operation (or `--abort` to cancel).

Make sure you run the above command in your workspace and repository root directories.

Built with [Mintlify](https://mintlify.com).
