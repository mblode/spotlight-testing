export type { SpotlightOptions, SpotlightState, SyncResult } from "./types.js";
export { spotlight, syncOnce, restore } from "./spotlight.js";
export { getTrackedFiles, getGitBranch, isGitWorktree, isGitRepo } from "./git.js";
