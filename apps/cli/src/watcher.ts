import type { FSWatcher } from "node:fs";
import { watch } from "node:fs";

export interface WatcherOptions {
  debounceMs?: number;
  dir: string;
  onSync: () => void;
}

const isIgnoredPath = (filename: string): boolean =>
  filename.includes("node_modules") ||
  filename.includes(".git/") ||
  filename.startsWith(".git") ||
  filename.includes("dist/");

export const createWatcher = (options: WatcherOptions): FSWatcher => {
  const { debounceMs = 300, dir, onSync } = options;

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let hasPending = false;

  const queueSync = (): void => {
    hasPending = true;

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      if (!hasPending) {
        return;
      }

      hasPending = false;
      onSync();
    }, debounceMs);
  };

  const watcher = watch(dir, { recursive: true }, (_event, filename) => {
    if (!filename) {
      queueSync();
      return;
    }

    if (isIgnoredPath(filename)) {
      return;
    }

    queueSync();
  });

  watcher.on("close", () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
  });

  return watcher;
};
