import { log, note } from "@clack/prompts";
import chalk from "chalk";

import type { SpotlightState } from "./types.js";

const STATUS_LABEL_WIDTH = 20;

interface StatusLine {
  label: string;
  value: string;
}

const timestamp = (): string =>
  chalk.dim(`[${new Date().toLocaleTimeString("en-AU", { hour12: false })}]`);

const formatStatusLine = ({ label, value }: StatusLine): string =>
  `${chalk.dim(label.padEnd(STATUS_LABEL_WIDTH))} ${value}`;

export const formatAccent = (value: string): string => chalk.cyan(value);
export const formatCommit = (value: string): string => chalk.magenta(value);
const formatDim = (value: string): string => chalk.dim(value);
const formatHeading = (value: string): string => chalk.bold(value);
const formatPath = (value: string): string => chalk.cyan(value);

export const showActivity = (message: string): void => {
  log.message(`${timestamp()} ${message}`, { symbol: chalk.dim("•") });
};

export const showError = (message: string): void => {
  log.error(message);
};

export const showInfo = (message: string): void => {
  log.info(message);
};

export const showSuccess = (message: string): void => {
  log.success(message);
};

export const showSpotlightStatus = (state: SpotlightState): void => {
  note(
    [
      { label: "PID", value: formatAccent(String(state.pid)) },
      { label: "Branch", value: formatAccent(state.worktreeBranch) },
      { label: "From", value: formatPath(state.worktreePath) },
      { label: "Into", value: formatPath(state.targetPath) },
      { label: "Started", value: state.startedAt },
      { label: "Last Sync", value: state.lastSyncAt ?? formatDim("n/a") },
      { label: "Workspace CP", value: formatAccent(state.workspaceCheckpointId) },
      {
        label: "Current Commit",
        value: formatCommit(state.workspaceCheckpointCommit.slice(0, 12)),
      },
      { label: "Restore CP", value: formatAccent(state.targetCheckpointId) },
      { label: "Restore Target", value: formatAccent(state.targetRestoreLabel) },
      { label: "Watcher", value: formatDim(state.watchBackend) },
    ]
      .map(formatStatusLine)
      .join("\n"),
    formatHeading("Spotlight ON"),
  );
};
