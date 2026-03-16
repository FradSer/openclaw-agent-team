import { homedir } from "node:os";
import { join } from "node:path";
import { readdir } from "node:fs/promises";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { jsonResult } from "openclaw/plugin-sdk";
import type { PluginRuntime } from "openclaw/plugin-sdk";
import { AgentTeamConfigSchema, AGENT_TEAM_CHANNEL } from "./types.js";
import { createTeamCreateTool, type TeamCreateParams } from "./tools/team-create.js";
import { createTeamShutdownTool, type TeamShutdownParams } from "./tools/team-shutdown.js";
import { createTeammateSpawnTool, type TeammateSpawnParams } from "./tools/teammate-spawn.js";
import { TeamLedger } from "./ledger.js";
import { teamDirectoryExists, resolveTeammatePaths } from "./storage.js";
import { setAgentTeamRuntime } from "./runtime.js";
import { agentTeamChannelPlugin } from "./channel.js";
import { createTeammateContextHook } from "./context-injection.js";

// Plugin constants
export const PLUGIN_ID = "openclaw-agent-team";
export const PLUGIN_NAME = "Agent Team";
export const PLUGIN_DESCRIPTION = "Multi-agent team coordination with messaging";

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

  const teamsDir = (pluginConfig?.["teamsDir"] as string | undefined) ?? join(homedir(), ".openclaw", "teams");

  // Cache for team ledgers
  const ledgerCache = new Map<string, TeamLedger>();

  return {
    teamsDir,
    config: {
      maxTeammatesPerTeam: (pluginConfig?.["maxTeammatesPerTeam"] as number | undefined) ?? 10,
      defaultAgentType: (pluginConfig?.["defaultAgentType"] as string | undefined) ?? "general-purpose",
    },
    getTeamLedger(teamName: string): TeamLedger {
      let ledger = ledgerCache.get(teamName);
      if (!ledger) {
        ledger = new TeamLedger(join(teamsDir, teamName));
        ledgerCache.set(teamName, ledger);
      }
      return ledger;
    },
    async teamExists(teamName: string): Promise<boolean> {
      return teamDirectoryExists(teamsDir, teamName);
    },
  };
}

type ToolContext = { agentId?: string; sessionKey?: string; [key: string]: unknown };
type ToolFactory = (ctx: ToolContext) => object;

/**
 * Registers a factory-based tool with OpenClaw so the handler receives the caller agentId.
 */
function registerToolFactory(
  api: OpenClawPluginApi,
  factory: ToolFactory,
  name: string
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  api.registerTool(factory as any, { name });
}

/**
 * Registers all team management tools using the factory pattern so each handler
 * receives the caller's agentId from the SDK tool context.
 */
function registerTeamTools(api: OpenClawPluginApi, ctx: PluginContext): void {
  const teamCreateTool = createTeamCreateTool(ctx);
  registerToolFactory(
    api,
    (sdkCtx: ToolContext) => ({
      name: "team_create",
      label: teamCreateTool.label,
      description: teamCreateTool.description,
      parameters: teamCreateTool.schema,
      async execute(_toolCallId: string, params: unknown) {
        try {
          return jsonResult(await teamCreateTool.handler(params as TeamCreateParams, sdkCtx?.agentId));
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return jsonResult({ error: { code: "EXECUTION_ERROR", message } });
        }
      },
    }),
    "team_create"
  );

  const teamShutdownTool = createTeamShutdownTool(ctx);
  registerToolFactory(
    api,
    (sdkCtx: ToolContext) => ({
      name: "team_shutdown",
      label: teamShutdownTool.label,
      description: teamShutdownTool.description,
      parameters: teamShutdownTool.schema,
      async execute(_toolCallId: string, params: unknown) {
        try {
          return jsonResult(await teamShutdownTool.handler(params as TeamShutdownParams, sdkCtx?.agentId));
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return jsonResult({ error: { code: "EXECUTION_ERROR", message } });
        }
      },
    }),
    "team_shutdown"
  );

  const teammateSpawnTool = createTeammateSpawnTool(ctx);
  registerToolFactory(
    api,
    (sdkCtx: ToolContext) => ({
      name: "teammate_spawn",
      label: teammateSpawnTool.label,
      description: teammateSpawnTool.description,
      parameters: teammateSpawnTool.schema,
      async execute(_toolCallId: string, params: unknown) {
        try {
          return jsonResult(await teammateSpawnTool.handler(params as TeammateSpawnParams, sdkCtx?.agentId));
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return jsonResult({ error: { code: "EXECUTION_ERROR", message } });
        }
      },
    }),
    "teammate_spawn"
  );
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
      name: string;
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

      const ledger = new TeamLedger(join(teamsDir, teamName));

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
              name: member.name,
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
            name: a.name,
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

  register(api: OpenClawPluginApi) {
    setAgentTeamRuntime(api.runtime);

    const ctx = createPluginContext(api);

    api.logger.info(`[agent-team] Plugin config: teamsDir=${ctx.teamsDir}, pluginConfig.teamsDir=${api.pluginConfig?.["teamsDir"] ?? "not set"}`);

    api.registerChannel({ plugin: agentTeamChannelPlugin });

    const safeLog = (msg: string) => {
      try {
        api.logger.info(msg);
      } catch {
        // ignore
      }
    };
    void syncTeammatesToConfig(api.runtime, ctx.teamsDir, safeLog);

    registerTeamTools(api, ctx);

    const teammateContextHook = createTeammateContextHook(ctx.teamsDir, (msg) => api.logger.error(msg));
    api.on("before_prompt_build", teammateContextHook);

    api.logger.info("[agent-team] Plugin registered successfully");
  },
};

export default agentTeamPlugin;
