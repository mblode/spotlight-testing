import { watch } from "node:fs";

export interface WatcherHandle {
  close: () => void;
}

interface WatcherOptions {
  debounceMs?: number;
  dir: string;
  onSync: () => Promise<void> | void;
}

const isIgnoredPath = (filePath: string): boolean => {
  const normalized = filePath.replaceAll("\\", "/");

  return (
    normalized.startsWith(".git") ||
    normalized.includes("/.git/") ||
    normalized.startsWith(".context/") ||
    normalized.includes("/.context/") ||
    normalized.startsWith("dist/") ||
    normalized.includes("/dist/") ||
    normalized.startsWith("node_modules/") ||
    normalized.includes("/node_modules/") ||
    normalized.includes(".tmp.")
  );
};

export const createWatcher = (options: WatcherOptions): WatcherHandle => {
  const { debounceMs = 300, dir, onSync } = options;
  let closed = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let pending = false;
  let running = false;

  const flush = async (): Promise<void> => {
    if (closed || running || !pending) {
      return;
    }

    pending = false;
    running = true;

    try {
      await onSync();
    } finally {
      running = false;

      if (pending) {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }

        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          void flush();
        }, debounceMs);
      }
    }
  };

  const scheduleFlush = (): void => {
    if (closed || running) {
      return;
    }

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void flush();
    }, debounceMs);
  };

  const queueSync = (): void => {
    pending = true;
    scheduleFlush();
  };

  const watcher = watch(dir, { recursive: true }, (_event, filename) => {
    if (!filename) {
      queueSync();
      return;
    }

    if (isIgnoredPath(String(filename))) {
      return;
    }

    queueSync();
  });

  return {
    close: (): void => {
      closed = true;

      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      watcher.close();
    },
  };
};
