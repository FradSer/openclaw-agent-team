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

// OpenClaw Tool type
interface OpenClawTool {
  label: string;
  name: string;
  description: string;
  schema: unknown;
  handler: (params: unknown) => Promise<unknown>;
}

// OpenClaw Plugin API types
interface OpenClawPluginApi {
  registerTool(tool: OpenClawTool): void;
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
  spawnAgent?(options: {
    agentId: string;
    agentType: string;
    model?: string;
    tools?: { allow?: string[]; deny?: string[] };
    workspace: string;
    agentDir: string;
  }): Promise<{ sessionKey: string }>;
  removeAgent?(sessionKey: string): Promise<void>;
  sendMessage?(params: { recipientSessionKey: string; type: string; content: string }): Promise<void>;
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
 * Wraps a tool to be compatible with OpenClaw's registerTool API by using type assertion.
 */
function toOpenClawTool(tool: {
  label: string;
  name: string;
  description: string;
  schema: unknown;
  handler: (params: unknown) => Promise<unknown>;
}): OpenClawTool {
  return tool;
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
  // Placeholder session context for tools that need it
  // In a real implementation, this would be populated from the session
  const placeholderSessionCtx: SessionContext = {
    teamsDir: ctx.teamsDir,
    teamName: "",
    teammateName: "",
    sessionKey: "",
  };

  // Team management tools
  api.registerTool(toOpenClawTool({
    label: "Team Create",
    name: "team_create",
    description: "Creates a new team for multi-agent coordination",
    schema: createTeamCreateTool(ctx).schema,
    handler: async (params: unknown) => createTeamCreateTool(ctx).handler(params as never),
  }));

  api.registerTool(toOpenClawTool({
    label: "Team Shutdown",
    name: "team_shutdown",
    description: "Gracefully shuts down a team and notifies all teammates",
    schema: createTeamShutdownTool(ctx).schema,
    handler: async (params: unknown) => createTeamShutdownTool(ctx).handler(params as never),
  }));

  // Teammate management tools
  api.registerTool(toOpenClawTool({
    label: "Teammate Spawn",
    name: "teammate_spawn",
    description: "Spawns a new teammate agent within an existing team",
    schema: createTeammateSpawnTool(ctx).schema,
    handler: async (params: unknown) => createTeammateSpawnTool(ctx).handler(params as never),
  }));

  // Task management tools
  api.registerTool(toOpenClawTool({
    label: "Task Create",
    name: "task_create",
    description: "Creates a new task within a team with optional dependencies",
    schema: createTaskCreateTool(ctx).schema,
    handler: async (params: unknown) => createTaskCreateTool(ctx).handler(params as never),
  }));

  api.registerTool(toOpenClawTool({
    label: "Task List",
    name: "task_list",
    description: "Lists tasks for a team with optional filtering",
    schema: createTaskListTool(ctx).schema,
    handler: async (params: unknown) => createTaskListTool(ctx).handler(params as never),
  }));

  api.registerTool(toOpenClawTool({
    label: "Task Claim",
    name: "task_claim",
    description: "Claims an available task for the current agent session",
    schema: createTaskClaimTool(ctx, placeholderSessionCtx).schema,
    handler: async (params: unknown) => createTaskClaimTool(ctx, placeholderSessionCtx).handler(params as never),
  }));

  api.registerTool(toOpenClawTool({
    label: "Task Complete",
    name: "task_complete",
    description: "Marks a claimed task as completed",
    schema: createTaskCompleteTool(ctx, placeholderSessionCtx).schema,
    handler: async (params: unknown) => createTaskCompleteTool(ctx, placeholderSessionCtx).handler(params as never),
  }));

  // Messaging tools
  api.registerTool(toOpenClawTool({
    label: "Send Message",
    name: "send_message",
    description: "Send a direct message to a teammate or broadcast to all teammates",
    schema: createSendMessageTool(ctx, "", "", ctx.getTeamLedger("")).schema,
    handler: async () => ({ error: { code: "NOT_CONFIGURED", message: "Tool not configured for this session" } }),
  }));

  api.registerTool(toOpenClawTool({
    label: "Inbox",
    name: "inbox",
    description: "Read messages from your inbox",
    schema: createInboxTool(placeholderSessionCtx).schema,
    handler: async (params: unknown) => createInboxTool(placeholderSessionCtx).handler(params as never),
  }));
}

/**
 * Gets session context from the current session.
 */
function getSessionContext(event: unknown): SessionContext | null {
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

// Re-export types and utilities for external use
export { TeamLedger } from "./ledger.js";
export { teamDirectoryExists, readTeamConfig, writeTeamConfig } from "./storage.js";
export { createContextInjectionHook } from "./context-injection.js";

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
