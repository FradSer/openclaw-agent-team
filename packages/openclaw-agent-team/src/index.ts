import { homedir } from "node:os";
import { join } from "node:path";
import type { TSchema } from "@sinclair/typebox";
import type { PluginRuntime } from "openclaw/plugin-sdk";
import { AgentTeamConfigSchema, parseTeammateAgentId } from "./types.js";
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
  // Placeholder session context for tools that need it
  const placeholderSessionCtx: SessionContext = {
    teamsDir: ctx.teamsDir,
    teamName: "",
    teammateName: "",
    sessionKey: "",
  };

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

  // Task management tools
  const taskCreateTool = createTaskCreateTool(ctx);
  registerTool(api, {
    name: "task_create",
    label: "Task Create",
    description: "Creates a new task within a team with optional dependencies",
    parameters: taskCreateTool.schema,
    run: (params) => taskCreateTool.handler(params as never),
  });

  const taskListTool = createTaskListTool(ctx);
  registerTool(api, {
    name: "task_list",
    label: "Task List",
    description: "Lists tasks for a team with optional filtering",
    parameters: taskListTool.schema,
    run: (params) => taskListTool.handler(params as never),
  });

  const taskClaimTool = createTaskClaimTool(ctx, placeholderSessionCtx);
  registerTool(api, {
    name: "task_claim",
    label: "Task Claim",
    description: "Claims an available task for the current agent session",
    parameters: taskClaimTool.schema,
    run: (params) => taskClaimTool.handler(params as never),
  });

  const taskCompleteTool = createTaskCompleteTool(ctx, placeholderSessionCtx);
  registerTool(api, {
    name: "task_complete",
    label: "Task Complete",
    description: "Marks a claimed task as completed",
    parameters: taskCompleteTool.schema,
    run: (params) => taskCompleteTool.handler(params as never),
  });

  // Messaging tools
  const sendMessageTool = createSendMessageTool(ctx, "", "", ctx.getTeamLedger(""));
  registerTool(api, {
    name: "send_message",
    label: "Send Message",
    description: "Send a direct message to a teammate or broadcast to all teammates",
    parameters: sendMessageTool.schema,
    run: async () => ({ error: { code: "NOT_CONFIGURED", message: "Tool not configured for this session" } }),
  });

  const inboxTool = createInboxTool(placeholderSessionCtx);
  registerTool(api, {
    name: "inbox",
    label: "Inbox",
    description: "Read messages from your inbox",
    parameters: inboxTool.schema,
    run: (params) => inboxTool.handler(params as never),
  });
}

/**
 * Gets session context from the current session.
 * Attempts to extract team/teammate info from:
 * 1. Direct event properties (teamName, teammateName)
 * 2. Parsing sessionKey (format: agent:teammate-{team}-{name}:main)
 */
function getSessionContext(event: unknown): SessionContext | null {
  const sessionEvent = event as {
    sessionKey?: string;
    teamName?: string;
    teammateName?: string;
    teamsDir?: string;
    agentId?: string;
  };

  if (!sessionEvent.sessionKey) {
    return null;
  }

  // Try to get team/teammate from direct properties first
  let teamName = sessionEvent.teamName;
  let teammateName = sessionEvent.teammateName;

  // If not provided directly, try to parse from sessionKey or agentId
  if (!teamName || !teammateName) {
    // sessionKey format: agent:teammate-{teamName}-{teammateName}:main
    // or agentId format: teammate-{teamName}-{teammateName}
    const agentId = sessionEvent.agentId || sessionEvent.sessionKey.split(":")[1];
    if (agentId) {
      const parsed = parseTeammateAgentId(agentId);
      if (parsed) {
        teamName = teamName || parsed.teamName;
        teammateName = teammateName || parsed.teammateName;
      }
    }
  }

  if (!teamName || !teammateName) {
    return null;
  }

  return {
    teamsDir: sessionEvent.teamsDir || join(homedir(), ".openclaw", "teams"),
    teamName,
    teammateName,
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

    // Register all tools
    registerTeamTools(api, ctx);

    // Register context injection hook for message delivery
    api.on("before_prompt_build", handleBeforePromptBuild);

    api.logger.info("[agent-team] Plugin registered successfully");
  },
};

export default agentTeamPlugin;
