export type { HeadState, SpotlightOptions, SpotlightState, SyncResult } from "./types.js";
export { spotlight, syncOnce, restore } from "./spotlight.js";
export { getGitBranch, getTrackedFiles, isGitRepo, isGitWorktree } from "./git.js";
