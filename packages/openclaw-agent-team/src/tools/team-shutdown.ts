import { Type, type Static } from "@sinclair/typebox";
import { join } from "node:path";
import { teamDirectoryExists, readTeamConfig, writeTeamConfig, deleteTeamDirectory } from "../storage.js";
import { TeamLedger } from "../ledger.js";
import { getAgentTeamRuntime } from "../runtime.js";

// Schema for team shutdown parameters
export const TeamShutdownSchema = Type.Object({
  team_name: Type.String({ minLength: 1, maxLength: 50 }),
  reason: Type.Optional(Type.String()),
});

export type TeamShutdownParams = Static<typeof TeamShutdownSchema>;

// Response types
export interface TeamShutdownResponse {
  teamId: string;
  teamName: string;
  status: "shutdown";
  shutdownAt: number;
  teammatesNotified: number;
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
export interface TeamShutdownTool {
  label: string;
  name: string;
  description: string;
  schema: typeof TeamShutdownSchema;
  handler: (params: TeamShutdownParams) => Promise<TeamShutdownResponse | ToolError>;
}

/**
 * Creates a team_shutdown tool that gracefully shuts down a team and all its teammates.
 */
export function createTeamShutdownTool(ctx: PluginContext): TeamShutdownTool {
  return {
    label: "Team Shutdown",
    name: "team_shutdown",
    description: "Gracefully shuts down a team and notifies all teammates",
    schema: TeamShutdownSchema,
    handler: async (params: TeamShutdownParams): Promise<TeamShutdownResponse | ToolError> => {
      const { team_name } = params;

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

      // Read team config
      const config = await readTeamConfig(ctx.teamsDir, team_name);
      if (!config) {
        return {
          error: {
            code: "TEAM_NOT_FOUND",
            message: `Team "${team_name}" configuration not found`,
          },
        };
      }

      // Check if team is already shutdown
      if (config.metadata.status === "shutdown") {
        return {
          error: {
            code: "TEAM_ALREADY_SHUTDOWN",
            message: `Team "${team_name}" is already shutdown`,
          },
        };
      }

      // Open ledger to get teammates
      const ledgerPath = join(ctx.teamsDir, team_name, "ledger.db");
      const ledger = new TeamLedger(ledgerPath);

      try {
        const members = await ledger.listMembers();
        const shutdownAt = Date.now();

        // Collect agent IDs to remove
        const teammateAgentIds = new Set(members.map((m) => m.agentId));

        // Remove agents via runtime config
        const runtime = getAgentTeamRuntime();
        const cfg = await runtime.config.loadConfig();

        const updatedCfg = {
          ...cfg,
          agents: {
            ...cfg.agents,
            list: (cfg.agents?.list ?? []).filter((a) => !teammateAgentIds.has(a.id)),
          },
          bindings: (cfg.bindings ?? []).filter((b) => !teammateAgentIds.has(b.agentId)),
        };

        await runtime.config.writeConfigFile(updatedCfg);

        // Update member status to shutdown in ledger
        let teammatesNotified = 0;
        for (const member of members) {
          await ledger.updateMemberStatus(member.sessionKey, "shutdown");
          teammatesNotified++;
        }

        // Update team config status to shutdown
        config.metadata.status = "shutdown";
        config.metadata.updatedAt = shutdownAt;
        await writeTeamConfig(ctx.teamsDir, team_name, config);

        // Delete the team directory after all updates are complete
        await deleteTeamDirectory(ctx.teamsDir, team_name);

        return {
          teamId: config.id,
          teamName: team_name,
          status: "shutdown",
          shutdownAt,
          teammatesNotified,
        };
      } finally {
        ledger.close();
      }
    },
  };
}
