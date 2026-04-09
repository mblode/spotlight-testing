import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getMainWorktreeRoot: vi.fn(),
  listActiveLockfiles: vi.fn(),
  readActiveLockfile: vi.fn(),
  readLockfile: vi.fn(),
  restore: vi.fn(),
  showError: vi.fn(),
  showInfo: vi.fn(),
  showSpotlightStatus: vi.fn(),
  showSuccess: vi.fn(),
  spotlight: vi.fn(),
  waitForLockfileRelease: vi.fn(),
}));

const mockCliDependencies = (): void => {
  vi.doMock("../src/git.js", () => ({
    getMainWorktreeRoot: mocks.getMainWorktreeRoot,
  }));

  vi.doMock("../src/spotlight.js", () => ({
    restore: mocks.restore,
    spotlight: mocks.spotlight,
  }));

  vi.doMock("../src/lockfile.js", () => ({
    listActiveLockfiles: mocks.listActiveLockfiles,
    readActiveLockfile: mocks.readActiveLockfile,
    readLockfile: mocks.readLockfile,
    waitForLockfileRelease: mocks.waitForLockfileRelease,
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
  mocks.getMainWorktreeRoot.mockReset();
  mocks.listActiveLockfiles.mockReset();
  mocks.readActiveLockfile.mockReset();
  mocks.readLockfile.mockReset();
  mocks.restore.mockReset();
  mocks.showError.mockReset();
  mocks.showInfo.mockReset();
  mocks.showSpotlightStatus.mockReset();
  mocks.showSuccess.mockReset();
  mocks.spotlight.mockReset();
  mocks.waitForLockfileRelease.mockReset();
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

  test("restores directly when off sees a stale process", async () => {
    mocks.listActiveLockfiles.mockReturnValue([]);
    mocks.readActiveLockfile.mockReturnValue(null);
    mocks.readLockfile.mockReturnValue({
      pid: 999_999,
      targetPath: "/tmp/target",
    });
    mockCliDependencies();
    const restoreArgv = setArgv(["node", "spotlight-testing", "off"]);
    vi.spyOn(process, "kill").mockImplementation((() => {
      throw new Error("missing process");
    }) as never);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit should not be called");
    }) as never);

    try {
      await import("../src/cli.js");
      expect(mocks.restore).toHaveBeenCalledWith("/tmp/target");
      expect(mocks.showInfo).toHaveBeenCalledWith("Stopping spotlight...");
      expect(mocks.showSuccess).toHaveBeenCalledWith("Spotlight stopped");
      expect(exitSpy).not.toHaveBeenCalled();
    } finally {
      restoreArgv();
    }
  });

  test("status renders the detailed spotlight card", async () => {
    const state = {
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
    };

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

  test("falls back to the only active spotlight outside repo context", async () => {
    const state = {
      pid: 123,
      targetPath: "/tmp/target",
    };

    mocks.listActiveLockfiles.mockReturnValue([state]);
    mocks.readActiveLockfile.mockReturnValue(null);
    mocks.readLockfile.mockReturnValue(null);
    mockCliDependencies();
    const restoreArgv = setArgv(["node", "spotlight-testing", "off"]);
    const killSpy = vi.spyOn(process, "kill").mockImplementation((() => {}) as never);
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/tmp/not-a-repo");
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit should not be called");
    }) as never);

    try {
      await import("../src/cli.js");
      expect(mocks.waitForLockfileRelease).toHaveBeenCalledWith(123, "/tmp/target");
      expect(killSpy).toHaveBeenCalledWith(123, "SIGTERM");
      expect(exitSpy).not.toHaveBeenCalled();
    } finally {
      cwdSpy.mockRestore();
      restoreArgv();
    }
  });

  test("status ignores stale scoped lockfiles", async () => {
    mocks.listActiveLockfiles.mockReturnValue([]);
    mocks.readActiveLockfile.mockReturnValue(null);
    mocks.readLockfile.mockReturnValue({
      pid: 999_999,
      targetPath: "/tmp/target",
    });
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

  test("off restores after a signalled process exits and leaves stale state behind", async () => {
    const staleState = {
      pid: 123,
      targetPath: "/tmp/target",
    };

    mocks.listActiveLockfiles.mockReturnValue([]);
    mocks.readActiveLockfile.mockReturnValue(staleState);
    mocks.readLockfile.mockImplementation((repoPath?: string) =>
      repoPath === "/tmp/target" ? staleState : null,
    );
    mockCliDependencies();
    const restoreArgv = setArgv(["node", "spotlight-testing", "off"]);
    const killSpy = vi.spyOn(process, "kill").mockImplementation((() => {}) as never);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit should not be called");
    }) as never);

    try {
      await import("../src/cli.js");
      expect(killSpy).toHaveBeenCalledWith(123, "SIGTERM");
      expect(mocks.waitForLockfileRelease).toHaveBeenCalledWith(123, "/tmp/target");
      expect(mocks.restore).toHaveBeenCalledWith("/tmp/target");
      expect(mocks.showSuccess).toHaveBeenCalledWith("Spotlight stopped");
      expect(exitSpy).not.toHaveBeenCalled();
    } finally {
      restoreArgv();
    }
  });
});
