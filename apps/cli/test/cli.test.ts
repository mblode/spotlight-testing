import { afterEach, describe, expect, test, vi } from "vitest";

const buildState = (overrides: Partial<Record<string, unknown>> = {}) => ({
  lastSyncAt: new Date().toISOString(),
  pid: 123,
  schemaVersion: 2,
  startedAt: new Date().toISOString(),
  targetCheckpointId: "cp-target-restore-1",
  targetPath: "/tmp/target",
  targetRestoreLabel: "main",
  watchBackend: "fs.watch(serialized)",
  workspaceCheckpointCommit: "0123456789abcdef0123456789abcdef01234567",
  workspaceCheckpointId: "cp-spotlight-1",
  worktreeBranch: "feature",
  worktreePath: "/tmp/worktree",
  ...overrides,
});

const mocks = vi.hoisted(() => ({
  getGitRoot: vi.fn(),
  getMainWorktreeRoot: vi.fn(),
  isGitRepo: vi.fn(),
  listActiveLockfiles: vi.fn(),
  readActiveLockfile: vi.fn(),
  readLockfile: vi.fn(),
  showError: vi.fn(),
  showInfo: vi.fn(),
  showSpotlightStatus: vi.fn(),
  showSuccess: vi.fn(),
  spotlight: vi.fn(),
  stopAndReset: vi.fn(),
  stopSpotlightSession: vi.fn(),
}));

const mockCliDependencies = (): void => {
  vi.doMock("../src/git.js", () => ({
    getGitRoot: mocks.getGitRoot,
    getMainWorktreeRoot: mocks.getMainWorktreeRoot,
    isGitRepo: mocks.isGitRepo,
  }));

  vi.doMock("../src/spotlight.js", () => ({
    spotlight: mocks.spotlight,
    stopAndReset: mocks.stopAndReset,
    stopSpotlightSession: mocks.stopSpotlightSession,
  }));

  vi.doMock("../src/lockfile.js", () => ({
    listActiveLockfiles: mocks.listActiveLockfiles,
    readActiveLockfile: mocks.readActiveLockfile,
    readLockfile: mocks.readLockfile,
  }));

  vi.doMock("../src/output.js", () => ({
    showError: mocks.showError,
    showInfo: mocks.showInfo,
    showSpotlightStatus: mocks.showSpotlightStatus,
    showSuccess: mocks.showSuccess,
  }));
};

const setArgv = (argv: string[]): (() => void) => {
  const originalArgv = [...process.argv];
  Object.defineProperty(process, "argv", {
    configurable: true,
    value: argv,
  });

  return () => {
    Object.defineProperty(process, "argv", {
      configurable: true,
      value: originalArgv,
    });
  };
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.doUnmock("../src/git.js");
  vi.doUnmock("../src/spotlight.js");
  vi.doUnmock("../src/lockfile.js");
  vi.doUnmock("../src/output.js");
  mocks.getGitRoot.mockReset();
  mocks.getMainWorktreeRoot.mockReset();
  mocks.isGitRepo.mockReset();
  mocks.listActiveLockfiles.mockReset();
  mocks.readActiveLockfile.mockReset();
  mocks.readLockfile.mockReset();
  mocks.showError.mockReset();
  mocks.showInfo.mockReset();
  mocks.showSpotlightStatus.mockReset();
  mocks.showSuccess.mockReset();
  mocks.spotlight.mockReset();
  mocks.stopAndReset.mockReset();
  mocks.stopSpotlightSession.mockReset();
});

describe("cli smoke", () => {
  test("passes the worktree, target, and debounce through to spotlight", async () => {
    mocks.listActiveLockfiles.mockReturnValue([]);
    mocks.readActiveLockfile.mockReturnValue(null);
    mocks.readLockfile.mockReturnValue(null);
    mockCliDependencies();
    const restoreArgv = setArgv([
      "node",
      "spotlight-testing",
      "on",
      "/tmp/worktree",
      "--target",
      "/tmp/target",
      "--debounce",
      "125",
    ]);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit should not be called");
    }) as never);

    try {
      await import("../src/cli.js");

      expect(mocks.spotlight).toHaveBeenCalledWith({
        debounce: 125,
        target: "/tmp/target",
        worktree: "/tmp/worktree",
      });
      expect(exitSpy).not.toHaveBeenCalled();
    } finally {
      restoreArgv();
    }
  });

  test("infers the main checkout from an explicit worktree path when target is omitted", async () => {
    mocks.listActiveLockfiles.mockReturnValue([]);
    mocks.readActiveLockfile.mockReturnValue(null);
    mocks.readLockfile.mockReturnValue(null);
    mocks.getMainWorktreeRoot.mockReturnValue("/tmp/target");
    mockCliDependencies();
    const restoreArgv = setArgv(["node", "spotlight-testing", "on", "/tmp/worktree"]);
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/tmp/unrelated-repo");
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit should not be called");
    }) as never);

    try {
      await import("../src/cli.js");

      expect(mocks.getMainWorktreeRoot).toHaveBeenCalledWith("/tmp/worktree");
      expect(mocks.spotlight).toHaveBeenCalledWith({
        debounce: 300,
        target: "/tmp/target",
        worktree: "/tmp/worktree",
      });
      expect(exitSpy).not.toHaveBeenCalled();
    } finally {
      cwdSpy.mockRestore();
      restoreArgv();
    }
  });

  test("defaults to the current worktree and infers the main checkout without a subcommand", async () => {
    mocks.listActiveLockfiles.mockReturnValue([]);
    mocks.readActiveLockfile.mockReturnValue(null);
    mocks.readLockfile.mockReturnValue(null);
    mocks.getMainWorktreeRoot.mockReturnValue("/tmp/target");
    mockCliDependencies();
    const restoreArgv = setArgv(["node", "spotlight-testing"]);
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/tmp/worktree");
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit should not be called");
    }) as never);

    try {
      await import("../src/cli.js");

      expect(mocks.getMainWorktreeRoot).toHaveBeenCalledWith("/tmp/worktree");
      expect(mocks.spotlight).toHaveBeenCalledWith({
        debounce: 300,
        target: "/tmp/target",
        worktree: "/tmp/worktree",
      });
      expect(exitSpy).not.toHaveBeenCalled();
    } finally {
      cwdSpy.mockRestore();
      restoreArgv();
    }
  });

  test("off stops the resolved spotlight session", async () => {
    const state = buildState();

    mocks.listActiveLockfiles.mockReturnValue([]);
    mocks.readActiveLockfile.mockReturnValue(state);
    mocks.readLockfile.mockReturnValue(null);
    mockCliDependencies();
    const restoreArgv = setArgv(["node", "spotlight-testing", "off"]);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit should not be called");
    }) as never);

    try {
      await import("../src/cli.js");
      expect(mocks.stopSpotlightSession).toHaveBeenCalledWith(state);
      expect(mocks.showInfo).toHaveBeenCalledWith("Stopping spotlight...");
      expect(mocks.showSuccess).toHaveBeenCalledWith("Spotlight stopped");
      expect(exitSpy).not.toHaveBeenCalled();
    } finally {
      restoreArgv();
    }
  });

  test("off falls back to the only active spotlight outside repo context", async () => {
    const state = buildState({ targetPath: "/tmp/target-two" });

    mocks.listActiveLockfiles.mockReturnValue([state]);
    mocks.readActiveLockfile.mockReturnValue(null);
    mocks.readLockfile.mockReturnValue(null);
    mockCliDependencies();
    const restoreArgv = setArgv(["node", "spotlight-testing", "off"]);
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/tmp/not-a-repo");
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit should not be called");
    }) as never);

    try {
      await import("../src/cli.js");
      expect(mocks.stopSpotlightSession).toHaveBeenCalledWith(state);
      expect(exitSpy).not.toHaveBeenCalled();
    } finally {
      cwdSpy.mockRestore();
      restoreArgv();
    }
  });

  test("off surfaces cleanup errors", async () => {
    const state = buildState();

    mocks.listActiveLockfiles.mockReturnValue([]);
    mocks.readActiveLockfile.mockReturnValue(state);
    mocks.readLockfile.mockReturnValue(null);
    mocks.stopSpotlightSession.mockImplementation(() => {
      throw new Error("boom");
    });
    mockCliDependencies();
    const restoreArgv = setArgv(["node", "spotlight-testing", "off"]);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);

    try {
      await import("../src/cli.js");
      expect(mocks.showError).toHaveBeenCalledWith("Cleanup error: boom");
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      restoreArgv();
    }
  });

  test("status renders the detailed spotlight card", async () => {
    const state = buildState();

    mocks.listActiveLockfiles.mockReturnValue([]);
    mocks.readActiveLockfile.mockReturnValue(state);
    mocks.readLockfile.mockReturnValue(null);
    mockCliDependencies();
    const restoreArgv = setArgv(["node", "spotlight-testing", "status"]);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit should not be called");
    }) as never);

    try {
      await import("../src/cli.js");
      expect(mocks.showSpotlightStatus).toHaveBeenCalledWith(state);
      expect(exitSpy).not.toHaveBeenCalled();
    } finally {
      restoreArgv();
    }
  });

  test("status ignores stale scoped lockfiles", async () => {
    mocks.listActiveLockfiles.mockReturnValue([]);
    mocks.readActiveLockfile.mockReturnValue(null);
    mocks.readLockfile.mockReturnValue(buildState());
    mockCliDependencies();
    const restoreArgv = setArgv(["node", "spotlight-testing", "status"]);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit should not be called");
    }) as never);

    try {
      await import("../src/cli.js");
      expect(mocks.showInfo).toHaveBeenCalledWith("No spotlight is running.");
      expect(mocks.showSpotlightStatus).not.toHaveBeenCalled();
      expect(exitSpy).not.toHaveBeenCalled();
    } finally {
      restoreArgv();
    }
  });

  test("stop calls stopAndReset with defaults from the current repo root", async () => {
    mocks.listActiveLockfiles.mockReturnValue([]);
    mocks.readActiveLockfile.mockReturnValue(null);
    mocks.readLockfile.mockReturnValue(null);
    mocks.getMainWorktreeRoot.mockReturnValue(null);
    mocks.getGitRoot.mockReturnValue("/tmp/main-repo");
    mocks.isGitRepo.mockReturnValue(true);
    mockCliDependencies();
    const restoreArgv = setArgv(["node", "spotlight-testing", "stop", "--no-fetch"]);
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/tmp/main-repo");
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit should not be called");
    }) as never);

    try {
      await import("../src/cli.js");
      expect(mocks.stopAndReset).toHaveBeenCalledWith({
        branch: "origin/main",
        fetch: false,
        remote: "origin",
        target: "/tmp/main-repo",
      });
      expect(exitSpy).not.toHaveBeenCalled();
    } finally {
      cwdSpy.mockRestore();
      restoreArgv();
    }
  });

  test("stop resolves the main checkout when run from a linked worktree", async () => {
    mocks.listActiveLockfiles.mockReturnValue([]);
    mocks.readActiveLockfile.mockReturnValue(null);
    mocks.readLockfile.mockReturnValue(null);
    mocks.getMainWorktreeRoot.mockReturnValue("/tmp/main-repo");
    mockCliDependencies();
    const restoreArgv = setArgv(["node", "spotlight-testing", "stop", "--no-fetch"]);
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/tmp/worktree");
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit should not be called");
    }) as never);

    try {
      await import("../src/cli.js");
      expect(mocks.stopAndReset).toHaveBeenCalledWith({
        branch: "origin/main",
        fetch: false,
        remote: "origin",
        target: "/tmp/main-repo",
      });
      expect(exitSpy).not.toHaveBeenCalled();
    } finally {
      cwdSpy.mockRestore();
      restoreArgv();
    }
  });

  test("stop uses the scoped spotlight target before repo inference", async () => {
    const state = buildState({ targetPath: "/tmp/scoped-target" });

    mocks.listActiveLockfiles.mockReturnValue([]);
    mocks.readActiveLockfile.mockReturnValue(null);
    mocks.readLockfile.mockReturnValue(state);
    mocks.getMainWorktreeRoot.mockReturnValue("/tmp/main-repo");
    mockCliDependencies();
    const restoreArgv = setArgv(["node", "spotlight-testing", "stop", "--no-fetch"]);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit should not be called");
    }) as never);

    try {
      await import("../src/cli.js");
      expect(mocks.stopAndReset).toHaveBeenCalledWith({
        branch: "origin/main",
        fetch: false,
        remote: "origin",
        target: "/tmp/scoped-target",
      });
      expect(exitSpy).not.toHaveBeenCalled();
    } finally {
      restoreArgv();
    }
  });

  test("stop falls back to the only active spotlight outside repo context", async () => {
    const state = buildState({ targetPath: "/tmp/active-target" });

    mocks.listActiveLockfiles.mockReturnValue([state]);
    mocks.readActiveLockfile.mockReturnValue(null);
    mocks.readLockfile.mockReturnValue(null);
    mocks.getMainWorktreeRoot.mockReturnValue(null);
    mocks.isGitRepo.mockReturnValue(false);
    mockCliDependencies();
    const restoreArgv = setArgv(["node", "spotlight-testing", "stop", "--no-fetch"]);
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/tmp/not-a-repo");
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit should not be called");
    }) as never);

    try {
      await import("../src/cli.js");
      expect(mocks.stopAndReset).toHaveBeenCalledWith({
        branch: "origin/main",
        fetch: false,
        remote: "origin",
        target: "/tmp/active-target",
      });
      expect(exitSpy).not.toHaveBeenCalled();
    } finally {
      cwdSpy.mockRestore();
      restoreArgv();
    }
  });

  test("stop prefers the current repo over an unrelated active spotlight", async () => {
    const unrelatedState = buildState({ targetPath: "/tmp/other-target" });

    mocks.listActiveLockfiles.mockReturnValue([unrelatedState]);
    mocks.readActiveLockfile.mockReturnValue(null);
    mocks.readLockfile.mockReturnValue(null);
    mocks.getMainWorktreeRoot.mockReturnValue(null);
    mocks.getGitRoot.mockReturnValue("/tmp/current-repo");
    mocks.isGitRepo.mockReturnValue(true);
    mockCliDependencies();
    const restoreArgv = setArgv(["node", "spotlight-testing", "stop", "--no-fetch"]);
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/tmp/current-repo");
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit should not be called");
    }) as never);

    try {
      await import("../src/cli.js");
      expect(mocks.stopAndReset).toHaveBeenCalledWith({
        branch: "origin/main",
        fetch: false,
        remote: "origin",
        target: "/tmp/current-repo",
      });
      expect(exitSpy).not.toHaveBeenCalled();
    } finally {
      cwdSpy.mockRestore();
      restoreArgv();
    }
  });

  test("stop exits with error when no target can be determined", async () => {
    mocks.listActiveLockfiles.mockReturnValue([]);
    mocks.readActiveLockfile.mockReturnValue(null);
    mocks.readLockfile.mockReturnValue(null);
    mocks.getMainWorktreeRoot.mockReturnValue(null);
    mocks.isGitRepo.mockReturnValue(false);
    mockCliDependencies();
    const restoreArgv = setArgv(["node", "spotlight-testing", "stop"]);
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/tmp/not-a-repo");
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);

    try {
      await import("../src/cli.js");
      expect(mocks.showError).toHaveBeenCalledWith(
        "Could not determine a target. Run from inside the repo, use a linked worktree, or pass --target <path>.",
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      cwdSpy.mockRestore();
      restoreArgv();
    }
  });

  test("stop surfaces cleanup errors", async () => {
    mocks.listActiveLockfiles.mockReturnValue([]);
    mocks.readActiveLockfile.mockReturnValue(null);
    mocks.readLockfile.mockReturnValue(null);
    mocks.getGitRoot.mockReturnValue("/tmp/main-repo");
    mocks.getMainWorktreeRoot.mockReturnValue(null);
    mocks.isGitRepo.mockReturnValue(true);
    mocks.stopAndReset.mockImplementation(() => {
      throw new Error("reset failed");
    });
    mockCliDependencies();
    const restoreArgv = setArgv(["node", "spotlight-testing", "stop"]);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);

    try {
      await import("../src/cli.js");
      expect(mocks.showError).toHaveBeenCalledWith("Cleanup error: reset failed");
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      restoreArgv();
    }
  });
});
