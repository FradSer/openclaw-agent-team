import { homedir } from "node:os";
import { join } from "node:path";
import { readdir } from "node:fs/promises";
import type { TSchema } from "@sinclair/typebox";
import type { PluginRuntime } from "openclaw/plugin-sdk";
import { AgentTeamConfigSchema, AGENT_TEAM_CHANNEL } from "./types.js";
import { createTeamCreateTool } from "./tools/team-create.js";
import { createTeamShutdownTool } from "./tools/team-shutdown.js";
import { createTeammateSpawnTool } from "./tools/teammate-spawn.js";
import { TeamLedger } from "./ledger.js";
import { teamDirectoryExists, resolveTeammatePaths } from "./storage.js";
import { setAgentTeamRuntime } from "./runtime.js";
import { agentTeamChannelPlugin } from "./channel.js";

// Plugin constants
export const PLUGIN_ID = "openclaw-agent-team";
export const PLUGIN_NAME = "Agent Team";
export const PLUGIN_DESCRIPTION = "Multi-agent team coordination with shared task ledger";

// OpenClaw Plugin API types (matching clawdbot-feishu pattern)
interface OpenClawPluginApi {
  registerTool(
    tool: {
      name: string;
      label: string;
      description: string;
      parameters: TSchema;
      execute: (toolCallId: string, params: unknown) => Promise<unknown>;
    },
    options: { name: string }
  ): void;
  registerChannel(params: { plugin: unknown }): void;
  on(event: string, handler: (event: unknown, ctx: unknown) => Promise<unknown>): void;
  logger: {
    info: (message: string) => void;
    error: (message: string) => void;
    warn: (message: string) => void;
    debug?: (message: string) => void;
  };
  pluginConfig?: {
    maxTeammatesPerTeam?: number;
    defaultAgentType?: string;
    teamsDir?: string;
  };
  runtime: PluginRuntime;
}

// Plugin context for tools
export interface PluginContext {
  teamsDir: string;
  config: {
    maxTeammatesPerTeam: number;
    defaultAgentType: string;
  };
  getTeamLedger(teamName: string): TeamLedger;
  teamExists(teamName: string): Promise<boolean>;
}

// Session context for tool handlers
export interface SessionContext {
  teamsDir: string;
  teamName: string;
  teammateName: string;
  sessionKey: string;
}

/**
 * Creates the plugin context with access to configuration and API.
 */
function createPluginContext(api: OpenClawPluginApi): PluginContext {
  // Get plugin config from api.pluginConfig
  const pluginConfig = api.pluginConfig;

  const teamsDir = pluginConfig?.teamsDir || join(homedir(), ".openclaw", "teams");

  // Cache for team ledgers
  const ledgerCache = new Map<string, TeamLedger>();

  return {
    teamsDir,
    config: {
      maxTeammatesPerTeam: pluginConfig?.maxTeammatesPerTeam ?? 10,
      defaultAgentType: pluginConfig?.defaultAgentType ?? "general-purpose",
    },
    getTeamLedger(teamName: string): TeamLedger {
      let ledger = ledgerCache.get(teamName);
      if (!ledger) {
        const dbPath = join(teamsDir, teamName, "ledger.db");
        ledger = new TeamLedger(dbPath);
        ledgerCache.set(teamName, ledger);
      }
      return ledger;
    },
    async teamExists(teamName: string): Promise<boolean> {
      return teamDirectoryExists(teamsDir, teamName);
    },
  };
}

/**
 * Registers a tool with OpenClaw (matching clawdbot-feishu pattern)
 */
function registerTool<P>(
  api: OpenClawPluginApi,
  spec: {
    name: string;
    label: string;
    description: string;
    parameters: TSchema;
    run: (params: P) => Promise<unknown>;
  }
): void {
  api.registerTool(
    {
      name: spec.name,
      label: spec.label,
      description: spec.description,
      parameters: spec.parameters,
      async execute(_toolCallId: string, params: unknown) {
        try {
          return await spec.run(params as P);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return { error: { code: "EXECUTION_ERROR", message } };
        }
      },
    },
    { name: spec.name }
  );
}

/**
 * Registers all team management tools.
 */
function registerTeamTools(api: OpenClawPluginApi, ctx: PluginContext): void {
  // Team management tools
  const teamCreateTool = createTeamCreateTool(ctx);
  registerTool(api, {
    name: "team_create",
    label: "Team Create",
    description: "Creates a new team for multi-agent coordination",
    parameters: teamCreateTool.schema,
    run: (params) => teamCreateTool.handler(params as never),
  });

  const teamShutdownTool = createTeamShutdownTool(ctx);
  registerTool(api, {
    name: "team_shutdown",
    label: "Team Shutdown",
    description: "Gracefully shuts down a team and notifies all teammates",
    parameters: teamShutdownTool.schema,
    run: (params) => teamShutdownTool.handler(params as never),
  });

  // Teammate management tools
  const teammateSpawnTool = createTeammateSpawnTool(ctx);
  registerTool(api, {
    name: "teammate_spawn",
    label: "Teammate Spawn",
    description: "Spawns a new teammate agent within an existing team",
    parameters: teammateSpawnTool.schema,
    run: (params) => teammateSpawnTool.handler(params as never),
  });
}

// Re-export types and utilities for external use
export { TeamLedger } from "./ledger.js";
export { teamDirectoryExists, readTeamConfig, writeTeamConfig } from "./storage.js";

/**
 * Syncs all team members from ledgers to the OpenClaw config.
 * This repairs any missing agent entries caused by race conditions during spawn.
 */
async function syncTeammatesToConfig(
  runtime: PluginRuntime,
  teamsDir: string,
  log: (msg: string) => void
): Promise<void> {
  try {
    // Read all team directories
    let teamDirs: string[];
    try {
      teamDirs = await readdir(teamsDir);
    } catch {
      return; // Directory doesn't exist, nothing to sync
    }

    if (teamDirs.length === 0) {
      return;
    }

    log(`[agent-team] Starting sync for ${teamDirs.length} teams`);

    const cfg = await runtime.config.loadConfig();
    const existingAgentIds = new Set((cfg.agents?.list ?? []).map(a => a.id));
    const agentsToAdd: Array<{
      agentId: string;
      teamName: string;
      memberName: string;
      workspace: string;
      agentDir: string;
    }> = [];

    // First, collect all agents that need to be added
    for (const teamName of teamDirs) {
      // Skip non-directories
      const teamPath = join(teamsDir, teamName);
      try {
        const stat = await import("node:fs/promises").then(fs => fs.stat(teamPath));
        if (!stat.isDirectory()) {
          continue;
        }
      } catch {
        continue;
      }

      const ledgerPath = join(teamsDir, teamName, "ledger.db");
      const ledger = new TeamLedger(ledgerPath);

      try {
        const members = await ledger.listMembers();

        for (const member of members) {
          if (member.status === "shutdown") {
            continue;
          }

          if (!existingAgentIds.has(member.agentId)) {
            const { workspace, agentDir } = resolveTeammatePaths(teamsDir, teamName, member.name);
            agentsToAdd.push({
              agentId: member.agentId,
              teamName,
              memberName: member.name,
              workspace,
              agentDir,
            });
            existingAgentIds.add(member.agentId); // Prevent duplicates within sync
          }
        }
      } catch (err) {
        log(`[agent-team] Error reading team ${teamName}: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        ledger.close();
      }
    }

    if (agentsToAdd.length === 0) {
      log(`[agent-team] Sync complete - no missing agents`);
      return;
    }

    log(`[agent-team] Found ${agentsToAdd.length} missing agents to sync`);

    // Now add all agents in a single config update
    const currentCfg = await runtime.config.loadConfig();
    const currentAgentIds = new Set((currentCfg.agents?.list ?? []).map(a => a.id));

    const newAgents = agentsToAdd.filter(a => !currentAgentIds.has(a.agentId));
    if (newAgents.length === 0) {
      log(`[agent-team] Sync complete - agents already exist`);
      return;
    }

    const updatedCfg = {
      ...currentCfg,
      agents: {
        ...currentCfg.agents,
        list: [
          ...(currentCfg.agents?.list ?? []),
          ...newAgents.map(a => ({
            id: a.agentId,
            workspace: a.workspace,
            agentDir: a.agentDir,
          })),
        ],
      },
      bindings: [
        ...(currentCfg.bindings ?? []),
        ...newAgents.map(a => ({
          agentId: a.agentId,
          match: {
            channel: AGENT_TEAM_CHANNEL,
            peer: {
              kind: "direct" as const,
              id: `${a.teamName.toLowerCase()}:${a.memberName.toLowerCase()}`
            },
          },
        })),
      ],
    };

    await runtime.config.writeConfigFile(updatedCfg);
    log(`[agent-team] Synced ${newAgents.length} missing agents: ${newAgents.map(a => a.agentId).join(", ")}`);
  } catch (err) {
    log(`[agent-team] Error syncing teammates: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Plugin definition (matching clawdbot-feishu pattern)
const agentTeamPlugin = {
  id: PLUGIN_ID,
  name: PLUGIN_NAME,
  description: PLUGIN_DESCRIPTION,
  configSchema: AgentTeamConfigSchema,

  // Note: register must NOT be async
  register(api: OpenClawPluginApi) {
    // Initialize runtime singleton for use by tools
    setAgentTeamRuntime(api.runtime);

    const ctx = createPluginContext(api);

    api.logger.info(`[agent-team] Plugin config: teamsDir=${ctx.teamsDir}, pluginConfig.teamsDir=${api.pluginConfig?.teamsDir || "not set"}`);

    // Register channel plugin (KEY CHANGE for teammate invocation)
    api.registerChannel({ plugin: agentTeamChannelPlugin });

    // Sync teammates on startup (async, non-blocking)
    const safeLog = (msg: string) => {
      try {
        api.logger.info(msg);
      } catch {
        // Ignore logging errors
      }
    };
    // Use setTimeout to ensure sync doesn't block plugin registration
    setTimeout(() => {
      syncTeammatesToConfig(api.runtime, ctx.teamsDir, safeLog).catch(() => {});
    }, 100);

    // Register all tools
    registerTeamTools(api, ctx);

    api.logger.info("[agent-team] Plugin registered successfully");
  },
};

export default agentTeamPlugin;
