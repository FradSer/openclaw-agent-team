import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, stat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createTeamShutdownTool } from "../../src/tools/team-shutdown.js";
import { createTeamCreateTool } from "../../src/tools/team-create.js";
import { createTeammateSpawnTool } from "../../src/tools/teammate-spawn.js";
import { TeamLedger } from "../../src/ledger.js";
import type { TeamConfig, TeammateDefinition } from "../../src/types.js";

// Type definitions based on the expected API
interface TeamShutdownResponse {
  teamId: string;
  teamName: string;
  status: "shutdown";
  shutdownAt: number;
  teammatesNotified: number;
}

interface ToolError {
  error: {
    code: string;
    message: string;
  };
}

interface PluginContext {
  teamsDir: string;
  api: {
    spawnAgent?: (config: {
      agentId: string;
      agentType: string;
      model?: string;
      tools?: { allow?: string[]; deny?: string[] };
      workspace: string;
      agentDir: string;
    }) => Promise<{ sessionKey: string }>;
    sendMessage?: (params: {
      recipientSessionKey: string;
      type: string;
      content: string;
    }) => Promise<void>;
    removeAgent?: (sessionKey: string) => Promise<void>;
  };
}

describe("team_shutdown tool", () => {
  let tempDir: string;
  let ctx: PluginContext;
  let sentMessages: Array<{ recipientSessionKey: string; type: string; content: string }>;
  let removedAgents: string[];

  beforeEach(async () => {
    tempDir = join(process.cwd(), "test-temp", `team-shutdown-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
    sentMessages = [];
    removedAgents = [];
    ctx = {
      teamsDir: tempDir,
      api: {
        spawnAgent: async (config) => ({
          sessionKey: `session-${config.agentId}-${Date.now()}`,
        }),
        sendMessage: async (params) => {
          sentMessages.push(params);
        },
        removeAgent: async (sessionKey: string) => {
          removedAgents.push(sessionKey);
        },
      },
    };
  });

  afterEach(async () => {
    await rm(join(process.cwd(), "test-temp"), { recursive: true, force: true });
  });

  // Helper function to create a team for testing
  async function createTestTeam(teamName: string): Promise<string> {
    const teamCreateTool = createTeamCreateTool(ctx);
    const result = await teamCreateTool.handler({ team_name: teamName });
    return (result as { teamId: string }).teamId;
  }

  // Helper function to create a team with multiple teammates
  async function createTeamWithTeammates(
    teamName: string,
    teammateCount: number
  ): Promise<{ teamId: string; sessionKeys: string[] }> {
    const teamId = await createTestTeam(teamName);
    const spawnTool = createTeammateSpawnTool(ctx);
    const sessionKeys: string[] = [];

    for (let i = 0; i < teammateCount; i++) {
      const result = (await spawnTool.handler({
        team_name: teamName,
        name: `agent-${i}`,
        agent_type: "General",
      })) as { sessionKey: string };
      sessionKeys.push(result.sessionKey);
    }

    return { teamId, sessionKeys };
  }

  // Helper function to create a team in shutdown state
  async function createShutdownTeam(teamName: string): Promise<void> {
    await createTestTeam(teamName);
    const { writeTeamConfig, readTeamConfig } = await import("../../src/storage.js");
    const config = await readTeamConfig(tempDir, teamName);
    if (config) {
      config.metadata.status = "shutdown";
      await writeTeamConfig(tempDir, teamName, config);
    }
  }

  describe("Given an active team with teammates", () => {
    describe("When shutting down the team", () => {
      it("Then should update team status to 'shutdown' in config", async () => {
        await createTeamWithTeammates("shutdown-status-team", 2);
        const tool = createTeamShutdownTool(ctx);
        const result = (await tool.handler({
          team_name: "shutdown-status-team",
        })) as TeamShutdownResponse;

        expect(result).toHaveProperty("status");
        expect(result.status).toBe("shutdown");

        // Verify config file was updated
        const { readTeamConfig } = await import("../../src/storage.js");
        const config = await readTeamConfig(tempDir, "shutdown-status-team");
        expect(config?.metadata.status).toBe("shutdown");
      });

      it("Then should send shutdown_request messages to all teammates", async () => {
        const { sessionKeys } = await createTeamWithTeammates("shutdown-message-team", 3);
        const tool = createTeamShutdownTool(ctx);
        const result = (await tool.handler({
          team_name: "shutdown-message-team",
        })) as TeamShutdownResponse;

        expect(result.teammatesNotified).toBe(3);

        // Verify all teammates received shutdown_request message
        expect(sentMessages.length).toBe(3);
        for (const msg of sentMessages) {
          expect(msg.type).toBe("shutdown_request");
        }

        // Verify each session key received a message
        const notifiedSessionKeys = sentMessages.map((m) => m.recipientSessionKey);
        for (const key of sessionKeys) {
          expect(notifiedSessionKeys).toContain(key);
        }
      });

      it("Then should remove agents from config", async () => {
        await createTeamWithTeammates("shutdown-remove-team", 2);
        const tool = createTeamShutdownTool(ctx);
        await tool.handler({
          team_name: "shutdown-remove-team",
        });

        // Verify agents were removed via API
        expect(removedAgents.length).toBe(2);
      });

      it("Then should update all teammate statuses to 'shutdown' in ledger", async () => {
        await createTeamWithTeammates("shutdown-ledger-team", 3);
        const tool = createTeamShutdownTool(ctx);
        await tool.handler({
          team_name: "shutdown-ledger-team",
        });

        // Verify all teammates have shutdown status in ledger
        const ledger = new TeamLedger(join(tempDir, "shutdown-ledger-team", "ledger.db"));
        const members = await ledger.listMembers();
        ledger.close();

        expect(members.length).toBe(3);
        for (const member of members) {
          expect(member.status).toBe("shutdown");
        }
      });

      it("Then should return shutdown timestamp", async () => {
        await createTeamWithTeammates("shutdown-timestamp-team", 1);
        const tool = createTeamShutdownTool(ctx);
        const beforeShutdown = Date.now();
        const result = (await tool.handler({
          team_name: "shutdown-timestamp-team",
        })) as TeamShutdownResponse;
        const afterShutdown = Date.now();

        expect(result.shutdownAt).toBeGreaterThanOrEqual(beforeShutdown);
        expect(result.shutdownAt).toBeLessThanOrEqual(afterShutdown);
      });
    });
  });

  describe("Given a non-existent team", () => {
    describe("When attempting to shut down", () => {
      it("Then should return TEAM_NOT_FOUND error", async () => {
        const tool = createTeamShutdownTool(ctx);
        const result = (await tool.handler({
          team_name: "non-existent-team",
        })) as ToolError;

        expect(result).toHaveProperty("error");
        expect(result.error.code).toBe("TEAM_NOT_FOUND");
        expect(result.error.message).toContain("not found");
      });
    });
  });

  describe("Given an already shutdown team", () => {
    describe("When attempting to shut down again", () => {
      it("Then should return TEAM_ALREADY_SHUTDOWN warning", async () => {
        await createShutdownTeam("already-shutdown-team");
        const tool = createTeamShutdownTool(ctx);
        const result = (await tool.handler({
          team_name: "already-shutdown-team",
        })) as ToolError;

        expect(result).toHaveProperty("error");
        expect(result.error.code).toBe("TEAM_ALREADY_SHUTDOWN");
        expect(result.error.message).toMatch(/already shutdown/i);
      });
    });
  });

  describe("Given an active team with no teammates", () => {
    describe("When shutting down the team", () => {
      it("Then should succeed with zero teammates notified", async () => {
        await createTestTeam("empty-shutdown-team");
        const tool = createTeamShutdownTool(ctx);
        const result = (await tool.handler({
          team_name: "empty-shutdown-team",
        })) as TeamShutdownResponse;

        expect(result.status).toBe("shutdown");
        expect(result.teammatesNotified).toBe(0);
        expect(sentMessages.length).toBe(0);
      });
    });
  });

  describe("Given a shutdown request with optional reason", () => {
    describe("When shutting down with a reason", () => {
      it("Then should include reason in shutdown_request messages", async () => {
        await createTeamWithTeammates("reason-shutdown-team", 2);
        const tool = createTeamShutdownTool(ctx);
        await tool.handler({
          team_name: "reason-shutdown-team",
          reason: "Project completed successfully",
        });

        // Verify reason is included in messages
        for (const msg of sentMessages) {
          expect(msg.content).toContain("Project completed successfully");
        }
      });
    });
  });

  describe("Tool schema", () => {
    it("should have correct tool name", () => {
      const tool = createTeamShutdownTool(ctx);
      expect(tool.name).toBe("team_shutdown");
    });

    it("should have description", () => {
      const tool = createTeamShutdownTool(ctx);
      expect(tool.description).toBeDefined();
      expect(tool.description.length).toBeGreaterThan(0);
    });

    it("should have schema defined", () => {
      const tool = createTeamShutdownTool(ctx);
      expect(tool.schema).toBeDefined();
    });
  });
});
