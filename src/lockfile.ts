import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { SpotlightState } from "./types.js"

const LOCKFILE = join(tmpdir(), "spotlight.lock")

export function isLocked(): boolean {
  if (!existsSync(LOCKFILE)) return false

  try {
    const state = readLockfile()
    if (!state) return false

    // Check if the process is still running
    try {
      process.kill(state.pid, 0)
      return true
    } catch {
      // Process is dead, clean up stale lockfile
      unlinkSync(LOCKFILE)
      return false
    }
  } catch {
    return false
  }
}

export function readLockfile(): SpotlightState | null {
  try {
    const content = readFileSync(LOCKFILE, "utf-8")
    return JSON.parse(content)
  } catch {
    return null
  }
}

export function writeLockfile(state: SpotlightState): void {
  writeFileSync(LOCKFILE, JSON.stringify(state, null, 2))
}

export function removeLockfile(): void {
  try {
    unlinkSync(LOCKFILE)
  } catch {
    // ignore
  }
}

export function getLockfilePath(): string {
  return LOCKFILE
}
