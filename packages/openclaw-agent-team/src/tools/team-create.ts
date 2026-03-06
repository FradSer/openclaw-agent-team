import { Type, type Static } from "@sinclair/typebox";
import { randomUUID } from "node:crypto";
import {
  validateTeamName,
  teamDirectoryExists,
  createTeamDirectory,
  writeTeamConfig,
} from "../storage.js";
import type { TeamConfig } from "../types.js";

// Schema for team creation parameters
export const TeamCreateSchema = Type.Object({
  team_name: Type.String({ minLength: 1, maxLength: 50 }),
  description: Type.Optional(Type.String()),
  agent_type: Type.Optional(Type.String({ default: "team-lead" })),
});

export type TeamCreateParams = Static<typeof TeamCreateSchema>;

// Response types
export interface TeamCreateResponse {
  teamId: string;
  teamName: string;
  status: "active";
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
  api?: unknown;
}

// Tool type for testing compatibility
export interface TeamCreateTool {
  label: string;
  name: string;
  description: string;
  schema: typeof TeamCreateSchema;
  handler: (params: TeamCreateParams) => Promise<TeamCreateResponse | ToolError>;
}

/**
 * Creates a team_create tool that creates new teams with isolated storage.
 */
export function createTeamCreateTool(ctx: PluginContext): TeamCreateTool {
  return {
    label: "Team Create",
    name: "team_create",
    description: "Creates a new team with isolated storage",
    schema: TeamCreateSchema,
    handler: async (params: TeamCreateParams): Promise<TeamCreateResponse | ToolError> => {
      const { team_name, description, agent_type } = params;

      // Check for empty team name
      if (!team_name || team_name.trim().length === 0) {
        return {
          error: {
            code: "EMPTY_TEAM_NAME",
            message: "Team name cannot be empty",
          },
        };
      }

      // Check team name length
      if (team_name.length > 50) {
        return {
          error: {
            code: "TEAM_NAME_TOO_LONG",
            message: `Team name exceeds maximum length of 50 characters (got ${team_name.length})`,
          },
        };
      }

      // Validate team name format
      if (!validateTeamName(team_name)) {
        return {
          error: {
            code: "INVALID_TEAM_NAME",
            message: `Team name "${team_name}" is invalid. Use only letters, numbers, hyphens, and underscores (1-50 chars).`,
          },
        };
      }

      // Check if team already exists
      const exists = await teamDirectoryExists(ctx.teamsDir, team_name);
      if (exists) {
        return {
          error: {
            code: "DUPLICATE_TEAM_NAME",
            message: `Team "${team_name}" already exists`,
          },
        };
      }

      // Create team directory structure
      await createTeamDirectory(ctx.teamsDir, team_name);

      // Generate UUID for team
      const teamId = randomUUID();

      // Create team config
      const now = Date.now();
      const config: TeamConfig = {
        id: teamId,
        team_name,
        agent_type: agent_type ?? "team-lead",
        lead: "", // Will be set when a lead agent joins
        metadata: {
          createdAt: now,
          updatedAt: now,
          status: "active",
        },
        ...(description !== undefined && { description }),
      };

      // Write team config
      await writeTeamConfig(ctx.teamsDir, team_name, config);

      return {
        teamId,
        teamName: team_name,
        status: "active",
      };
    },
  };
}
