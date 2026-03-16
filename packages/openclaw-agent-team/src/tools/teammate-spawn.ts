import { Type, type Static } from "@sinclair/typebox";
import { join } from "node:path";
import { teamDirectoryExists } from "../storage.js";
import { TeamLedger } from "../ledger.js";
import { getAgentTeamRuntime } from "../runtime.js";
import { maybeSpawnTeammate } from "../dynamic-teammate.js";
import type { TeammatePathTemplates } from "../types.js";

// Mutex queue to serialize spawns per team and prevent race conditions
const teamSpawnQueues = new Map<string, Promise<unknown>>();

/**
 * Executes a function with a per-team mutex to prevent concurrent spawns
 * from racing on config updates. Uses a queue-based approach where each
 * operation waits for the previous one to complete before starting.
 */
async function withTeamLock<T>(teamName: string, fn: () => Promise<T>): Promise<T> {
  // Get the current tail of the queue (or undefined if queue is empty)
  const currentTail = teamSpawnQueues.get(teamName);

  // Create our promise that will be resolved when we're done
  let releaseLock: () => void;
  const ourPromise = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  // Put our promise at the tail of the queue BEFORE waiting
  // This ensures the next operation will wait for us
  teamSpawnQueues.set(teamName, ourPromise);

  try {
    // Wait for the previous operation to complete (if any)
    if (currentTail) {
      await currentTail;
    }
    // Now it's our turn - execute the function
    return await fn();
  } finally {
    // Release the lock for the next operation
    releaseLock!();
  }
}

// Schema for teammate spawn parameters
export const TeammateSpawnSchema = Type.Object({
  team_name: Type.String({ minLength: 1, maxLength: 50 }),
  name: Type.String({ minLength: 1, maxLength: 100 }),
  agent_type: Type.Optional(Type.String()),
  model: Type.Optional(Type.String()),
  tools: Type.Optional(
    Type.Object({
      allow: Type.Optional(Type.Array(Type.String())),
      deny: Type.Optional(Type.Array(Type.String())),
    })
  ),
});

export type TeammateSpawnParams = Static<typeof TeammateSpawnSchema>;

// Response types
export interface TeammateSpawnResponse {
  agentId: string;
  name: string;
  sessionKey: string;
  status: "idle";
}

export interface ToolError {
  error: {
    code: string;
    message: string;
  };
}

// Plugin context type
export interface PluginContext {
  teamsDir: string;
  config?: {
    maxTeammatesPerTeam?: number;
    pathTemplates?: TeammatePathTemplates;
  };
}

// Tool type for testing compatibility
export interface TeammateSpawnTool {
  label: string;
  name: string;
  description: string;
  schema: typeof TeammateSpawnSchema;
  handler: (params: TeammateSpawnParams, callerAgentId?: string) => Promise<TeammateSpawnResponse | ToolError>;
}

// Default max teammates per team
const DEFAULT_MAX_TEAMMATES = 10;

/**
 * Creates a teammate_spawn tool that spawns new teammates within a team.
 */
export function createTeammateSpawnTool(ctx: PluginContext): TeammateSpawnTool {
  return {
    label: "Teammate Spawn",
    name: "teammate_spawn",
    description: "Spawns a new teammate agent within an existing team",
    schema: TeammateSpawnSchema,
    handler: async (params: TeammateSpawnParams, callerAgentId?: string): Promise<TeammateSpawnResponse | ToolError> => {
      // Use per-team lock to prevent race conditions when spawning multiple teammates concurrently
      return withTeamLock(params.team_name, () => spawnTeammateHandler(ctx, params, callerAgentId));
    },
  };
}

/**
 * Internal handler for spawning teammates using the dynamic-teammate module.
 */
async function spawnTeammateHandler(
  ctx: PluginContext,
  params: TeammateSpawnParams,
  _callerAgentId?: string
): Promise<TeammateSpawnResponse | ToolError> {
  const { team_name, name, agent_type, model, tools } = params;

  // Check if team exists
  const exists = await teamDirectoryExists(ctx.teamsDir, team_name);
  if (!exists) {
    return {
      error: {
        code: "TEAM_NOT_FOUND",
        message: `Team "${team_name}" not found`,
      },
    };
  }

  // Open ledger
  const ledger = new TeamLedger(join(ctx.teamsDir, team_name));

  try {
    const spawnParams: {
      teamsDir: string;
      teamName: string;
      teammateName: string;
      agentType?: string;
      model?: string;
      tools?: { allow?: string[]; deny?: string[] };
      pathTemplates?: TeammatePathTemplates;
      maxTeammates: number;
      runtime: ReturnType<typeof getAgentTeamRuntime>;
      ledger: TeamLedger;
      log: (msg: string) => void;
    } = {
      teamsDir: ctx.teamsDir,
      teamName: team_name,
      teammateName: name,
      maxTeammates: ctx.config?.maxTeammatesPerTeam ?? DEFAULT_MAX_TEAMMATES,
      runtime: getAgentTeamRuntime(),
      ledger,
      log: (msg) => console.log(msg),
    };

    // Only add optional properties if they are defined
    if (agent_type !== undefined) spawnParams.agentType = agent_type;
    if (model !== undefined) spawnParams.model = model;
    if (tools !== undefined) spawnParams.tools = tools;
    if (ctx.config?.pathTemplates !== undefined) spawnParams.pathTemplates = ctx.config.pathTemplates;

    const result = await maybeSpawnTeammate(spawnParams);

    if (result.error) {
      return { error: result.error };
    }

    return {
      agentId: result.agentId!,
      name,
      sessionKey: result.sessionKey!,
      status: "idle",
    };
  } finally {
    ledger.close();
  }
}