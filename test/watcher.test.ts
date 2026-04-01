import { describe, expect, test } from "vitest";
import { setTimeout as delay } from "node:timers/promises";

import { createWatcher } from "../src/watcher.js";
import { cleanupTempDir, createTempDir, writeTextFile } from "./helpers/git-fixtures.js";

const waitFor = async (predicate: () => boolean, timeoutMs = 2000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }

    await delay(25);
  }

  throw new Error("Timed out waiting for watcher event");
};

describe.skipIf(process.platform !== "darwin")("watcher smoke", () => {
  test("emits a sync on nested file changes", async () => {
    const root = createTempDir();
    writeTextFile(root, "nested/file.txt", "one\n");

    let syncCount = 0;
    const watcher = createWatcher({
      debounceMs: 50,
      dir: root,
      onSync: () => {
        syncCount += 1;
      },
    });

    try {
      await delay(100);
      writeTextFile(root, "nested/file.txt", "two\n");
      await waitFor(() => syncCount > 0);
      expect(syncCount).toBeGreaterThan(0);
    } finally {
      watcher.close();
      cleanupTempDir(root);
    }
  });
});
