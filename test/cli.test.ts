import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getMainWorktreeRoot: vi.fn(),
  readLockfile: vi.fn(),
  restore: vi.fn(),
  spotlight: vi.fn(),
}));

vi.mock("../src/git.js", () => ({
  getMainWorktreeRoot: mocks.getMainWorktreeRoot,
}));

vi.mock("../src/spotlight.js", () => ({
  restore: mocks.restore,
  spotlight: mocks.spotlight,
}));

vi.mock("../src/lockfile.js", () => ({
  readLockfile: mocks.readLockfile,
}));

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
  mocks.getMainWorktreeRoot.mockReset();
  mocks.readLockfile.mockReset();
  mocks.restore.mockReset();
  mocks.spotlight.mockReset();
});

describe("cli smoke", () => {
  test("passes include-untracked through to spotlight", async () => {
    mocks.readLockfile.mockReturnValue(null);
    mocks.getMainWorktreeRoot.mockReturnValue("/tmp/inferred-target");
    const restoreArgv = setArgv([
      "node",
      "spotlight-testing",
      "on",
      "/tmp/worktree",
      "--target",
      "/tmp/target",
      "--debounce",
      "125",
      "--include-untracked",
    ]);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit should not be called");
    }) as never);

    try {
      await import("../src/cli.js");

      expect(mocks.spotlight).toHaveBeenCalledWith({
        debounce: 125,
        includeUntracked: true,
        protect: undefined,
        target: "/tmp/target",
        worktree: "/tmp/worktree",
      });
      expect(warnSpy).not.toHaveBeenCalled();
      expect(exitSpy).not.toHaveBeenCalled();
    } finally {
      restoreArgv();
    }
  });

  test("defaults to the current worktree and infers the main checkout without a subcommand", async () => {
    mocks.readLockfile.mockReturnValue(null);
    mocks.getMainWorktreeRoot.mockReturnValue("/tmp/target");
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
        includeUntracked: false,
        protect: undefined,
        target: "/tmp/target",
        worktree: "/tmp/worktree",
      });
      expect(exitSpy).not.toHaveBeenCalled();
    } finally {
      cwdSpy.mockRestore();
      restoreArgv();
    }
  });

  test("keeps deprecated no-untracked behavior working", async () => {
    mocks.readLockfile.mockReturnValue(null);
    mocks.getMainWorktreeRoot.mockReturnValue("/tmp/inferred-target");
    const restoreArgv = setArgv([
      "node",
      "spotlight-testing",
      "on",
      "/tmp/worktree",
      "--target",
      "/tmp/target",
      "--no-untracked",
    ]);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      await import("../src/cli.js");

      expect(warnSpy).toHaveBeenCalled();
      expect(mocks.spotlight).toHaveBeenCalledWith(
        expect.objectContaining({
          includeUntracked: false,
          target: "/tmp/target",
          worktree: "/tmp/worktree",
        }),
      );
    } finally {
      restoreArgv();
    }
  });
});
