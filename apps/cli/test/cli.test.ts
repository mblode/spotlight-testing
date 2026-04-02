import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getMainWorktreeRoot: vi.fn(),
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

  test("defaults to the current worktree and infers the main checkout without a subcommand", async () => {
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

    mocks.readLockfile.mockReturnValue(state);
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
});
