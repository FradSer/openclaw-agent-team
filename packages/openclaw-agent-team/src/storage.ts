import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import type { TeamConfig } from "./types.js";

// Constants
export const TEAM_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,50}$/;
export const TEAMMATE_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/;

// Default teams directory
const DEFAULT_TEAMS_DIR = () => join(homedir(), ".openclaw", "teams");

/**
 * Validates a team name against the allowed pattern.
 * Team names must be 1-50 characters and contain only letters, numbers, underscores, and hyphens.
 */
export function validateTeamName(name: string): boolean {
  return TEAM_NAME_PATTERN.test(name);
}

/**
 * Sanitizes a teammate name for use in file paths.
 * Converts to lowercase, replaces invalid characters with hyphens, and truncates to 100 characters.
 */
export function sanitizeTeammateName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .slice(0, 100);
}

/**
 * Creates a team directory with the required structure.
 * Creates: teamDir/, teamDir/config.json, teamDir/ledger.db, teamDir/inbox/, teamDir/agents/
 */
export async function createTeamDirectory(
  teamsDir: string,
  teamName: string
): Promise<void> {
  if (!validateTeamName(teamName)) {
    throw new Error(
      `Invalid team name "${teamName}". Must be 1-50 characters and contain only letters, numbers, underscores, and hyphens.`
    );
  }

  const teamDir = join(teamsDir, teamName);

  // Create main team directory
  await mkdir(teamDir, { recursive: true, mode: 0o700 });

  // Create empty config.json
  const configPath = join(teamDir, "config.json");
  await writeFile(configPath, "{}", { mode: 0o600 });

  // Create empty ledger.db
  const ledgerPath = join(teamDir, "ledger.db");
  await writeFile(ledgerPath, "", { mode: 0o600 });

  // Create inbox directory
  await mkdir(join(teamDir, "inbox"), { mode: 0o700 });

  // Create agents directory
  await mkdir(join(teamDir, "agents"), { mode: 0o700 });
}

/**
 * Checks if a team directory exists with a valid config.json file.
 */
export async function teamDirectoryExists(
  teamsDir: string,
  teamName: string
): Promise<boolean> {
  try {
    const teamDir = join(teamsDir, teamName);
    const dirStat = await stat(teamDir);
    if (!dirStat.isDirectory()) return false;

    const configPath = join(teamDir, "config.json");
    const configStat = await stat(configPath);
    return configStat.isFile();
  } catch {
    return false;
  }
}

/**
 * Writes a team configuration to the config.json file.
 */
export async function writeTeamConfig(
  teamsDir: string,
  teamName: string,
  config: TeamConfig
): Promise<void> {
  const configPath = resolveTeamPath(teamsDir, teamName, "config.json");
  await writeFile(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
}

/**
 * Reads a team configuration from the config.json file.
 * Returns null if the file doesn't exist or is invalid.
 */
export async function readTeamConfig(
  teamsDir: string,
  teamName: string
): Promise<TeamConfig | null> {
  try {
    const configPath = resolveTeamPath(teamsDir, teamName, "config.json");
    const content = await readFile(configPath, "utf-8");
    const config = JSON.parse(content) as TeamConfig;
    return config;
  } catch {
    return null;
  }
}

/**
 * Resolves paths for a teammate's workspace, agent directory, and inbox.
 */
export function resolveTeammatePaths(
  teamsDir: string,
  teamName: string,
  teammateName: string
): {
  workspace: string;
  agentDir: string;
  inboxPath: string;
} {
  const sanitized = sanitizeTeammateName(teammateName);
  const agentBase = resolveTeamPath(teamsDir, teamName, "agents", sanitized);

  return {
    workspace: join(agentBase, "workspace"),
    agentDir: join(agentBase, "agent"),
    inboxPath: resolveTeamPath(teamsDir, teamName, "inbox", sanitized, "messages.jsonl"),
  };
}

/**
 * Resolves a path within a team directory with path traversal protection.
 * Throws an error if the resolved path would escape the teams directory.
 */
export function resolveTeamPath(
  teamsDir: string,
  teamName: string,
  ...segments: string[]
): string {
  // Validate team name doesn't contain path separators
  if (!validateTeamName(teamName)) {
    throw new Error(`Invalid team name: ${teamName}`);
  }

  // Build the target path
  const targetPath = resolve(teamsDir, teamName, ...segments);
  const normalizedTeamsDir = resolve(teamsDir);

  // Ensure the resolved path is within the teams directory
  if (!targetPath.startsWith(normalizedTeamsDir + sep) && targetPath !== normalizedTeamsDir) {
    throw new Error(
      `Path traversal detected: attempted to access "${targetPath}" which is outside the teams directory`
    );
  }

  return targetPath;
}

// Import sep for path separator check
import { sep } from "node:path";

/**
 * Gets the base directory for teams storage.
 * Returns ~/.openclaw/teams/ by default.
 */
export function getTeamsBaseDir(): string {
  return DEFAULT_TEAMS_DIR();
}
