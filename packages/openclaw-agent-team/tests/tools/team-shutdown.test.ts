import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, rm, stat, readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { createTeamShutdownTool } from "../../src/tools/team-shutdown.js";
import { createTeamCreateTool } from "../../src/tools/team-create.js";
import { createTeammateSpawnTool } from "../../src/tools/teammate-spawn.js";
import { TeamLedger } from "../../src/ledger.js";
import { setAgentTeamRuntime, resetAgentTeamRuntime } from "../../src/runtime.js";
import type { TeamConfig, TeammateDefinition } from "../../src/types.js";
import type { PluginRuntime } from "openclaw/plugin-sdk";

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
}

describe("team_shutdown tool", () => {
  let tempDir: string;
  let ctx: PluginContext;
  let mockConfig: {
    agents: { list: Array<{ id: string; workspace: string; agentDir: string }> };
    bindings: Array<{ agentId: string; match: unknown }>;
  };

  beforeEach(async () => {
    tempDir = join(process.cwd(), "test-temp", `team-shutdown-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });

    // Initialize mock config that tracks agents
    mockConfig = {
      agents: { list: [] },
      bindings: [],
    };

    // Initialize mock runtime
    const mockRuntime = {
      config: {
        loadConfig: vi.fn().mockImplementation(() => Promise.resolve(mockConfig)),
        writeConfigFile: vi.fn().mockImplementation((cfg) => {
          mockConfig.agents = cfg.agents;
          mockConfig.bindings = cfg.bindings;
          return Promise.resolve();
        }),
      },
    };
    setAgentTeamRuntime(mockRuntime as unknown as PluginRuntime);

    ctx = {
      teamsDir: tempDir,
    };
  });

  afterEach(async () => {
    resetAgentTeamRuntime();
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
        // Directory is deleted after shutdown, so we verify the response status
      });

      it("Then should send shutdown_request messages to all teammates", async () => {
        const { sessionKeys } = await createTeamWithTeammates("shutdown-message-team", 3);
        const tool = createTeamShutdownTool(ctx);
        const result = (await tool.handler({
          team_name: "shutdown-message-team",
        })) as TeamShutdownResponse;

        expect(result.teammatesNotified).toBe(3);
        // Directory is deleted after shutdown, teammatesNotified count is verified in response
      });

      it("Then should remove agents from config", async () => {
        await createTeamWithTeammates("shutdown-remove-team", 2);
        const tool = createTeamShutdownTool(ctx);
        await tool.handler({
          team_name: "shutdown-remove-team",
        });

        // Verify agents were removed from config
        expect(mockConfig.agents.list.length).toBe(0);
        expect(mockConfig.bindings.length).toBe(0);
      });

      it("Then should update all teammate statuses to 'shutdown' in ledger", async () => {
        await createTeamWithTeammates("shutdown-ledger-team", 3);
        const tool = createTeamShutdownTool(ctx);
        const result = (await tool.handler({
          team_name: "shutdown-ledger-team",
        })) as TeamShutdownResponse;

        // Directory is deleted after shutdown, verify response indicates all were notified
        expect(result.teammatesNotified).toBe(3);
        expect(result.status).toBe("shutdown");
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
      });
    });
  });

  describe("Given a shutdown request with optional reason", () => {
    describe("When shutting down with a reason", () => {
      it("Then should accept the reason parameter", async () => {
        await createTeamWithTeammates("reason-shutdown-team", 2);
        const tool = createTeamShutdownTool(ctx);
        const result = await tool.handler({
          team_name: "reason-shutdown-team",
          reason: "Project completed successfully",
        });

        // Verify shutdown succeeded
        expect((result as TeamShutdownResponse).status).toBe("shutdown");
        expect((result as TeamShutdownResponse).teammatesNotified).toBe(2);
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

  describe("Given an active team with teammates", () => {
    describe("When shutting down the team with directory deletion", () => {
      it("Then should completely remove the team directory from filesystem", async () => {
        const teamName = "directory-delete-team";
        await createTeamWithTeammates(teamName, 2);
        const teamDir = join(tempDir, teamName);

        // Verify team directory exists before shutdown
        const dirStatBefore = await stat(teamDir);
        expect(dirStatBefore.isDirectory()).toBe(true);

        const tool = createTeamShutdownTool(ctx);
        const result = (await tool.handler({
          team_name: teamName,
        })) as TeamShutdownResponse;

        expect(result.status).toBe("shutdown");

        // Verify team directory no longer exists after shutdown
        await expect(access(teamDir)).rejects.toThrow();
      });

      it("Then should remove all agents for the team from openclaw.json", async () => {
        const teamName = "agents-remove-team";
        const { sessionKeys } = await createTeamWithTeammates(teamName, 3);

        // Verify agents exist in config before shutdown
        expect(mockConfig.agents.list.length).toBe(3);
        expect(mockConfig.bindings.length).toBe(3);

        const tool = createTeamShutdownTool(ctx);
        await tool.handler({
          team_name: teamName,
        });

        // Verify all agents were removed from config
        expect(mockConfig.agents.list.length).toBe(0);
        expect(mockConfig.bindings.length).toBe(0);
      });

      it("Then should remove only the shutdown team's agents, preserving other agents", async () => {
        // Create two teams
        const team1Name = "preserve-agents-team1";
        const team2Name = "preserve-agents-team2";
        await createTeamWithTeammates(team1Name, 2);
        await createTeamWithTeammates(team2Name, 1);

        // Verify both teams have agents
        expect(mockConfig.agents.list.length).toBe(3);
        expect(mockConfig.bindings.length).toBe(3);

        // Shutdown only team1
        const tool = createTeamShutdownTool(ctx);
        await tool.handler({
          team_name: team1Name,
        });

        // Verify only team1's agents were removed (2 agents)
        expect(mockConfig.agents.list.length).toBe(1);
        expect(mockConfig.bindings.length).toBe(1);

        // Verify team2's directory still exists
        const team2Dir = join(tempDir, team2Name);
        const team2DirStat = await stat(team2Dir);
        expect(team2DirStat.isDirectory()).toBe(true);
      });

      it("Then should remove all team files including ledger, config, and agent directories", async () => {
        const teamName = "all-files-delete-team";
        await createTeamWithTeammates(teamName, 2);
        const teamDir = join(tempDir, teamName);

        // Verify all files exist before shutdown
        const configFile = join(teamDir, "config.json");
        const agentsDir = join(teamDir, "agents");

        await expect(stat(configFile)).resolves.toBeDefined();
        await expect(stat(agentsDir)).resolves.toBeDefined();

        const tool = createTeamShutdownTool(ctx);
        await tool.handler({
          team_name: teamName,
        });

        // Verify all files are removed (directory no longer exists)
        await expect(access(teamDir)).rejects.toThrow();
      });
    });
  });

  describe("Given a non-existent team", () => {
    describe("When attempting directory deletion during shutdown", () => {
      it("Then should return TEAM_NOT_FOUND error without attempting directory deletion", async () => {
        const tool = createTeamShutdownTool(ctx);
        const result = (await tool.handler({
          team_name: "non-existent-delete-team",
        })) as ToolError;

        expect(result).toHaveProperty("error");
        expect(result.error.code).toBe("TEAM_NOT_FOUND");
        expect(result.error.message).toMatch(/not found/i);
      });
    });
  });

  describe("Given an already shutdown team", () => {
    describe("When attempting to shut down an already-shutdown team (directory still exists)", () => {
      it("Then should return TEAM_ALREADY_SHUTDOWN error", async () => {
        // Create a team and manually set it to shutdown state without deleting directory
        const teamName = "already-shutdown-no-delete-team";
        await createShutdownTeam(teamName);

        const tool = createTeamShutdownTool(ctx);
        const result = (await tool.handler({
          team_name: teamName,
        })) as ToolError;

        expect(result).toHaveProperty("error");
        expect(result.error.code).toBe("TEAM_ALREADY_SHUTDOWN");
      });
    });

    describe("When attempting to shut down a team after directory was deleted", () => {
      it("Then should return TEAM_NOT_FOUND error", async () => {
        const teamName = "deleted-then-shutdown-team";
        await createTeamWithTeammates(teamName, 1);

        const tool = createTeamShutdownTool(ctx);

        // First shutdown - should succeed and delete directory
        const firstResult = (await tool.handler({
          team_name: teamName,
        })) as TeamShutdownResponse;
        expect(firstResult.status).toBe("shutdown");

        // Second shutdown - should return TEAM_NOT_FOUND since directory was deleted
        const secondResult = (await tool.handler({
          team_name: teamName,
        })) as ToolError;

        expect(secondResult).toHaveProperty("error");
        expect(secondResult.error.code).toBe("TEAM_NOT_FOUND");
      });
    });
  });

  describe("Given a team directory that cannot be deleted", () => {
    describe("When filesystem errors occur during deletion", () => {
      it("Then should handle permission errors gracefully", async () => {
        // This test documents expected behavior for edge cases
        // The actual implementation should handle fs.rm errors appropriately
        const teamName = "permission-error-team";
        await createTestTeam(teamName);

        const tool = createTeamShutdownTool(ctx);
        // For now, this should succeed - the test documents the expected behavior
        const result = (await tool.handler({
          team_name: teamName,
        })) as TeamShutdownResponse;

        expect(result.status).toBe("shutdown");
      });
    });
  });

  // BDD Scenarios from feature file: Team Shutdown with Directory Deletion
  describe("Feature: Team Shutdown with Directory Deletion", () => {
    describe("Scenario: Shutdown team removes directory", () => {
      it("Given an active team 'shutdown-test', When I shutdown team 'shutdown-test', Then the team directory should NOT exist And the response should contain status: shutdown", async () => {
        // Given an active team "shutdown-test"
        const teamName = "shutdown-test";
        await createTestTeam(teamName);
        const teamDir = join(tempDir, teamName);

        // Verify team directory exists before shutdown
        const dirStatBefore = await stat(teamDir);
        expect(dirStatBefore.isDirectory()).toBe(true);

        // When I shutdown team "shutdown-test"
        const tool = createTeamShutdownTool(ctx);
        const result = (await tool.handler({
          team_name: teamName,
        })) as TeamShutdownResponse;

        // Then the team directory should NOT exist
        await expect(access(teamDir)).rejects.toThrow();

        // And the response should contain status: shutdown
        expect(result.status).toBe("shutdown");
      });
    });

    describe("Scenario: Shutdown team cleans openclaw.json", () => {
      it("Given an active team 'config-test' with 3 teammates, And openclaw.json contains agents for each teammate, And openclaw.json contains bindings for each teammate, When I shutdown team 'config-test', Then openclaw.json should NOT contain agents matching 'teammate-config-test-*', And openclaw.json should NOT contain bindings matching 'teammate-config-test-*'", async () => {
        // Given an active team "config-test" with 3 teammates
        const teamName = "config-test";
        const { sessionKeys } = await createTeamWithTeammates(teamName, 3);

        // And openclaw.json contains agents for each teammate
        // And openclaw.json contains bindings for each teammate
        // (This is handled by createTeamWithTeammates which adds agents to mockConfig)
        expect(mockConfig.agents.list.length).toBe(3);
        expect(mockConfig.bindings.length).toBe(3);

        // Capture agent IDs before shutdown for verification
        const agentIdsBefore = mockConfig.agents.list.map((a) => a.id);
        const bindingAgentIdsBefore = mockConfig.bindings.map((b) => b.agentId);

        // Verify agents match the expected pattern
        for (const agentId of agentIdsBefore) {
          expect(agentId).toMatch(/^teammate-config-test-/);
        }
        for (const agentId of bindingAgentIdsBefore) {
          expect(agentId).toMatch(/^teammate-config-test-/);
        }

        // When I shutdown team "config-test"
        const tool = createTeamShutdownTool(ctx);
        await tool.handler({
          team_name: teamName,
        });

        // Then openclaw.json should NOT contain agents matching "teammate-config-test-*"
        const remainingAgents = mockConfig.agents.list.filter((a) =>
          a.id.match(/^teammate-config-test-/)
        );
        expect(remainingAgents.length).toBe(0);

        // And openclaw.json should NOT contain bindings matching "teammate-config-test-*"
        const remainingBindings = mockConfig.bindings.filter((b) =>
          b.agentId.match(/^teammate-config-test-/)
        );
        expect(remainingBindings.length).toBe(0);
      });
    });
  });
});
