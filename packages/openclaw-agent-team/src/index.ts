import { Type } from "@sinclair/typebox";
import { homedir } from "node:os";
import { join } from "node:path";
import { AgentTeamConfigSchema } from "./types.js";
import { createTeamCreateTool } from "./tools/team-create.js";
import { createTeamShutdownTool } from "./tools/team-shutdown.js";
import { createTeammateSpawnTool } from "./tools/teammate-spawn.js";
import { createTaskCreateTool } from "./tools/task-create.js";
import { createTaskListTool } from "./tools/task-list.js";
import { createTaskClaimTool } from "./tools/task-claim.js";
import { createTaskCompleteTool } from "./tools/task-complete.js";
import { createSendMessageTool } from "./tools/send-message.js";
import { createInboxTool } from "./tools/inbox.js";
import { createContextInjectionHook } from "./context-injection.js";
import { TeamLedger } from "./ledger.js";
import { teamDirectoryExists } from "./storage.js";

// Plugin constants
export const PLUGIN_ID = "agent-team";
export const PLUGIN_NAME = "Agent Team";
export const PLUGIN_DESCRIPTION = "Multi-agent team coordination with shared task ledger";

// OpenClaw Plugin API types
interface OpenClawPluginApi {
  registerTool(tool: {
    label: string;
    name: string;
    description: string;
    schema: unknown;
    handler: (params: unknown) => Promise<unknown>;
  }): void;
  on(event: string, handler: (event: unknown, ctx: unknown) => Promise<unknown>): void;
  logger: {
    info: (message: string) => void;
    error: (message: string) => void;
    warn: (message: string) => void;
    debug: (message: string) => void;
  };
  config: {
    get(): Record<string, unknown>;
  };
  spawnAgent?(options: { agentType: string; model?: string; tools?: { allow?: string[]; deny?: string[] } }): Promise<string>;
  removeAgent?(sessionKey: string): Promise<void>;
  sendMessage?(sessionKey: string, message: { type: string; content: string; summary?: string }): Promise<void>;
  requestHeartbeatWake?(sessionKey: string): void;
}

// Plugin context for tools
export interface PluginContext {
  teamsDir: string;
  config: {
    maxTeammatesPerTeam: number;
    defaultAgentType: string;
  };
  api: OpenClawPluginApi;
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
  const config = api.config.get() as {
    maxTeammatesPerTeam?: number;
    defaultAgentType?: string;
    teamsDir?: string;
  };

  const teamsDir = config.teamsDir || join(homedir(), ".openclaw", "teams");

  // Cache for team ledgers
  const ledgerCache = new Map<string, TeamLedger>();

  return {
    teamsDir,
    config: {
      maxTeammatesPerTeam: config.maxTeammatesPerTeam ?? 10,
      defaultAgentType: config.defaultAgentType ?? "general-purpose",
    },
    api,
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
 * Registers all team management tools.
 */
function registerTeamTools(api: OpenClawPluginApi, ctx: PluginContext): void {
  // Team management tools
  api.registerTool(createTeamCreateTool(ctx));
  api.registerTool(createTeamShutdownTool(ctx));

  // Teammate management tools
  api.registerTool(createTeammateSpawnTool(ctx));

  // Task management tools
  api.registerTool(createTaskCreateTool(ctx));
  api.registerTool(createTaskListTool(ctx));
  api.registerTool(createTaskClaimTool(ctx));
  api.registerTool(createTaskCompleteTool(ctx));

  // Messaging tools
  api.registerTool(createSendMessageTool(ctx));
  api.registerTool(createInboxTool(ctx));
}

/**
 * Gets session context from the current session.
 * This is a placeholder that should be replaced with actual session detection.
 */
function getSessionContext(event: unknown): SessionContext | null {
  // In a real implementation, this would extract session info from the event
  // For now, return null to indicate no teammate session
  const sessionEvent = event as {
    sessionKey?: string;
    teamName?: string;
    teammateName?: string;
    teamsDir?: string;
  };

  if (!sessionEvent.sessionKey || !sessionEvent.teamName || !sessionEvent.teammateName) {
    return null;
  }

  return {
    teamsDir: sessionEvent.teamsDir || join(homedir(), ".openclaw", "teams"),
    teamName: sessionEvent.teamName,
    teammateName: sessionEvent.teammateName,
    sessionKey: sessionEvent.sessionKey,
  };
}

/**
 * Handles the before_prompt_build hook for context injection.
 */
async function handleBeforePromptBuild(event: unknown): Promise<{ prependContext?: string }> {
  const sessionCtx = getSessionContext(event);

  if (!sessionCtx) {
    return { prependContext: "" };
  }

  const hook = createContextInjectionHook(sessionCtx, { clearAfterRead: true });
  return hook();
}

// Plugin definition
const agentTeamPlugin = {
  id: PLUGIN_ID,
  name: PLUGIN_NAME,
  description: PLUGIN_DESCRIPTION,
  configSchema: AgentTeamConfigSchema,

  async register(api: OpenClawPluginApi): Promise<void> {
    const ctx = createPluginContext(api);

    // Register all tools
    registerTeamTools(api, ctx);

    // Register context injection hook for message delivery
    api.on("before_prompt_build", handleBeforePromptBuild);

    api.logger.info("[agent-team] Plugin registered successfully");
  },
};

export default agentTeamPlugin;
