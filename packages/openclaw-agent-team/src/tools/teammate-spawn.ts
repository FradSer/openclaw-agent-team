import { Type, type Static } from "@sinclair/typebox";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  TEAMMATE_NAME_PATTERN,
  teamDirectoryExists,
  readTeamConfig,
  resolveTeammatePaths,
  resolveTeammateSessionsDir,
} from "../storage.js";
import { TeamLedger } from "../ledger.js";
import { getAgentTeamRuntime } from "../runtime.js";
import type { TeammateDefinition, TeammateToolsSchema } from "../types.js";
import { buildTeammateAgentId, AGENT_TEAM_CHANNEL } from "../types.js";

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
}

// Tool type for testing compatibility
export interface TeammateSpawnTool {
  label: string;
  name: string;
  description: string;
  schema: typeof TeammateSpawnSchema;
  handler: (params: TeammateSpawnParams) => Promise<TeammateSpawnResponse | ToolError>;
}

// Default max teammates per team
const DEFAULT_MAX_TEAMMATES = 10;

/**
 * Validates a teammate name against the allowed pattern.
 * Teammate names must be 1-100 characters and contain only letters, numbers, underscores, and hyphens.
 */
function validateTeammateName(name: string): boolean {
  return TEAMMATE_NAME_PATTERN.test(name);
}

/**
 * Creates a teammate_spawn tool that spawns new teammates within a team.
 */
export function createTeammateSpawnTool(ctx: PluginContext): TeammateSpawnTool {
  return {
    label: "Teammate Spawn",
    name: "teammate_spawn",
    description: "Spawns a new teammate agent within an existing team",
    schema: TeammateSpawnSchema,
    handler: async (params: TeammateSpawnParams): Promise<TeammateSpawnResponse | ToolError> => {
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

      // Read team config to check status
      const config = await readTeamConfig(ctx.teamsDir, team_name);
      if (!config) {
        return {
          error: {
            code: "TEAM_NOT_FOUND",
            message: `Team "${team_name}" configuration not found`,
          },
        };
      }

      // Check if team is active
      if (config.metadata.status !== "active") {
        return {
          error: {
            code: "TEAM_NOT_ACTIVE",
            message: `Team "${team_name}" is not active. Current status: ${config.metadata.status}`,
          },
        };
      }

      // Validate teammate name format
      if (!validateTeammateName(name)) {
        return {
          error: {
            code: "INVALID_TEAMMATE_NAME",
            message: `Teammate name "${name}" contains invalid characters. Only letters, numbers, underscores, and hyphens are allowed.`,
          },
        };
      }

      // Generate agent ID using helper
      const agentId = buildTeammateAgentId(team_name, name);

      // Resolve paths for teammate
      const { workspace, agentDir } = resolveTeammatePaths(ctx.teamsDir, team_name, name);

      // Open ledger to check capacity and duplicate names
      const ledgerPath = join(ctx.teamsDir, team_name, "ledger.db");
      const ledger = new TeamLedger(ledgerPath);

      try {
        // Check current member count
        const currentMembers = await ledger.listMembers();
        if (currentMembers.length >= DEFAULT_MAX_TEAMMATES) {
          ledger.close();
          return {
            error: {
              code: "TEAM_AT_CAPACITY",
              message: `Team "${team_name}" has reached maximum teammates (${DEFAULT_MAX_TEAMMATES})`,
            },
          };
        }

        // Check for duplicate name
        const duplicateName = currentMembers.find((m) => m.name === name);
        if (duplicateName) {
          ledger.close();
          return {
            error: {
              code: "DUPLICATE_TEAMMATE_NAME",
              message: `Teammate "${name}" already exists in team "${team_name}"`,
            },
          };
        }

        // Create workspace and agent directories
        await mkdir(workspace, { recursive: true, mode: 0o700 });
        await mkdir(agentDir, { recursive: true, mode: 0o700 });

        // Create sessions directory for teammate
        const sessionsDir = resolveTeammateSessionsDir(ctx.teamsDir, team_name, name);
        await mkdir(sessionsDir, { recursive: true, mode: 0o700 });

        // Generate session key
        const sessionKey = `agent:${agentId}:main`;

        // Create teammate definition
        const now = Date.now();
        const teammate: TeammateDefinition = {
          name,
          agentId,
          sessionKey,
          agentType: agent_type ?? "general-purpose",
          status: "idle",
          joinedAt: now,
        };

        // Add optional fields
        if (model !== undefined) {
          teammate.model = model;
        }
        if (tools !== undefined) {
          teammate.tools = tools as Static<typeof TeammateToolsSchema>;
        }

        // Add teammate to ledger
        await ledger.addMember(teammate);

        // Register agent via runtime config
        const runtime = getAgentTeamRuntime();
        const cfg = await runtime.config.loadConfig();

        const updatedCfg = {
          ...cfg,
          agents: {
            ...cfg.agents,
            list: [...(cfg.agents?.list ?? []), { id: agentId, workspace, agentDir }],
          },
          bindings: [
            ...(cfg.bindings ?? []),
            {
              agentId,
              match: {
                channel: AGENT_TEAM_CHANNEL,
                peer: { kind: "direct" as const, id: `${team_name}:${name}` },
              },
            },
          ],
        };

        await runtime.config.writeConfigFile(updatedCfg);

        return {
          agentId,
          name,
          sessionKey,
          status: "idle",
        };
      } finally {
        ledger.close();
      }
    },
  };
}
