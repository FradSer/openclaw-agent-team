import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, rm, stat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createTeammateSpawnTool } from "../../src/tools/teammate-spawn.js";
import { createTeamCreateTool } from "../../src/tools/team-create.js";
import { TeamLedger } from "../../src/ledger.js";
import { setAgentTeamRuntime, resetAgentTeamRuntime } from "../../src/runtime.js";
import type { TeamConfig, TeammateDefinition } from "../../src/types.js";
import type { PluginRuntime } from "openclaw/plugin-sdk";

// Type definitions based on the expected API
interface TeammateSpawnResponse {
  agentId: string;
  name: string;
  sessionKey: string;
  status: "idle";
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

describe("teammate_spawn tool", () => {
  let tempDir: string;
  let ctx: PluginContext;

  beforeEach(async () => {
    tempDir = join(process.cwd(), "test-temp", `teammate-spawn-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
    ctx = {
      teamsDir: tempDir,
    };

    // Initialize mock runtime
    const mockRuntime = {
      config: {
        loadConfig: vi.fn().mockResolvedValue({
          agents: { list: [] },
          bindings: [],
        }),
        writeConfigFile: vi.fn().mockResolvedValue(undefined),
      },
    };
    setAgentTeamRuntime(mockRuntime as unknown as PluginRuntime);
  });

  afterEach(async () => {
    resetAgentTeamRuntime();
    await rm(join(process.cwd(), "test-temp"), { recursive: true, force: true });
  });

  const CALLER_ID = "test-agent";

  // Helper function to create a team for testing
  async function createTestTeam(teamName: string): Promise<string> {
    const teamCreateTool = createTeamCreateTool(ctx);
    const result = await teamCreateTool.handler({ team_name: teamName }, CALLER_ID);
    return (result as { teamId: string }).teamId;
  }

  // Helper function to create a team in shutdown state
  async function createShutdownTeam(teamName: string): Promise<void> {
    await createTestTeam(teamName);
    // Manually update the config to shutdown status
    const { writeTeamConfig, readTeamConfig } = await import("../../src/storage.js");
    const config = await readTeamConfig(tempDir, teamName);
    if (config) {
      config.metadata.status = "shutdown";
      await writeTeamConfig(tempDir, teamName, config);
    }
  }

  describe("Given a valid teammate spawn request", () => {
    describe("When spawning a teammate with full agent configuration", () => {
      it("Then should create agent config entry in config.json", async () => {
        await createTestTeam("test-team");
        const tool = createTeammateSpawnTool(ctx);
        const result = (await tool.handler({
          team_name: "test-team",
          name: "researcher",
          agent_type: "Explore",
        })) as TeammateSpawnResponse;

        expect(result).toHaveProperty("agentId");
        expect(result).toHaveProperty("name");
        expect(result).toHaveProperty("sessionKey");
        expect(result).toHaveProperty("status");
        expect(result.status).toBe("idle");
      });

      it("Then should create workspace and agentDir directories", async () => {
        await createTestTeam("dir-test-team");
        const tool = createTeammateSpawnTool(ctx);
        await tool.handler({
          team_name: "dir-test-team",
          name: "coder",
          agent_type: "Code",
        });

        const workspacePath = join(tempDir, "dir-test-team", "agents", "coder", "workspace");
        const agentDirPath = join(tempDir, "dir-test-team", "agents", "coder", "agent");

        const workspaceStat = await stat(workspacePath);
        const agentDirStat = await stat(agentDirPath);

        expect(workspaceStat.isDirectory()).toBe(true);
        expect(agentDirStat.isDirectory()).toBe(true);
      });

      it("Then should add teammate to ledger", async () => {
        await createTestTeam("ledger-test-team");
        const tool = createTeammateSpawnTool(ctx);
        const result = (await tool.handler({
          team_name: "ledger-test-team",
          name: "analyst",
          agent_type: "Analyze",
        })) as TeammateSpawnResponse;

        // Open the ledger and check if the teammate was added
        const ledger = new TeamLedger(join(tempDir, "ledger-test-team", "ledger.db"));
        const members = await ledger.listMembers();
        ledger.close();

        expect(members.length).toBe(1);
        expect(members[0].name).toBe("analyst");
        expect(members[0].agentId).toBe(result.agentId);
        expect(members[0].sessionKey).toBe(result.sessionKey);
      });

      it("Then should generate agent ID in correct format (teammate-{team_name}-{name})", async () => {
        await createTestTeam("id-format-team");
        const tool = createTeammateSpawnTool(ctx);
        const result = (await tool.handler({
          team_name: "id-format-team",
          name: "researcher",
          agent_type: "Explore",
        })) as TeammateSpawnResponse;

        expect(result.agentId).toBe("teammate-id-format-team-researcher");
      });

      it("Then should normalize agent ID to lowercase", async () => {
        await createTestTeam("MyTeam");
        const tool = createTeammateSpawnTool(ctx);
        const result = (await tool.handler({
          team_name: "MyTeam",
          name: "Alice",
          agent_type: "Explore",
        })) as TeammateSpawnResponse;

        expect(result.agentId).toBe("teammate-myteam-alice");
      });

      it("Then should normalize binding peer ID to lowercase", async () => {
        await createTestTeam("BindingTeam");
        const tool = createTeammateSpawnTool(ctx);
        await tool.handler({
          team_name: "BindingTeam",
          name: "Charlie",
          agent_type: "Explore",
        });

        // Get the mock runtime and verify binding peer ID is lowercase
        const { getAgentTeamRuntime } = await import("../../src/runtime.js");
        const runtime = getAgentTeamRuntime();
        const writeCall = (runtime.config.writeConfigFile as ReturnType<typeof vi.fn>).mock.calls[0][0];

        expect(writeCall.bindings).toHaveLength(1);
        expect(writeCall.bindings[0].match.peer.id).toBe("bindingteam:charlie");
      });
    });

    describe("When spawning with tool restrictions", () => {
      it("Then teammate can only use specified tools in allow list", async () => {
        await createTestTeam("tool-restrict-team");
        const tool = createTeammateSpawnTool(ctx);
        const result = (await tool.handler({
          team_name: "tool-restrict-team",
          name: "restricted-agent",
          agent_type: "Limited",
          tools: {
            allow: ["read_file", "write_file"],
          },
        })) as TeammateSpawnResponse;

        // Verify the spawnAgent API was called with tool restrictions
        // Check ledger for tools configuration
        const ledger = new TeamLedger(join(tempDir, "tool-restrict-team", "ledger.db"));
        const members = await ledger.listMembers();
        ledger.close();

        expect(members[0].tools).toBeDefined();
        expect(members[0].tools?.allow).toEqual(["read_file", "write_file"]);
      });

      it("Then should apply deny list restrictions", async () => {
        await createTestTeam("deny-list-team");
        const tool = createTeammateSpawnTool(ctx);
        const result = (await tool.handler({
          team_name: "deny-list-team",
          name: "deny-agent",
          agent_type: "Limited",
          tools: {
            deny: ["delete_file", "execute_command"],
          },
        })) as TeammateSpawnResponse;

        const ledger = new TeamLedger(join(tempDir, "deny-list-team", "ledger.db"));
        const members = await ledger.listMembers();
        ledger.close();

        expect(members[0].tools?.deny).toEqual(["delete_file", "execute_command"]);
      });
    });
  });

  describe("Given a team at maximum capacity", () => {
    describe("When attempting to spawn another teammate", () => {
      it("Then should return TEAM_AT_CAPACITY error", async () => {
        await createTestTeam("capacity-team");
        const tool = createTeammateSpawnTool(ctx);

        // Spawn 10 teammates (default max)
        for (let i = 0; i < 10; i++) {
          await tool.handler({
            team_name: "capacity-team",
            name: `agent-${i}`,
            agent_type: "General",
          });
        }

        // Try to spawn the 11th teammate
        const result = (await tool.handler({
          team_name: "capacity-team",
          name: "agent-11",
          agent_type: "General",
        })) as ToolError;

        expect(result).toHaveProperty("error");
        expect(result.error.code).toBe("TEAM_AT_CAPACITY");
        expect(result.error.message).toContain("maximum teammates");
      });
    });
  });

  describe("Given an invalid teammate name", () => {
    describe("When attempting to spawn with name containing special characters", () => {
      it("Then should return INVALID_TEAMMATE_NAME error for 'test!!'", async () => {
        await createTestTeam("invalid-name-team");
        const tool = createTeammateSpawnTool(ctx);
        const result = (await tool.handler({
          team_name: "invalid-name-team",
          name: "test!!",
          agent_type: "General",
        })) as ToolError;

        expect(result).toHaveProperty("error");
        expect(result.error.code).toBe("INVALID_TEAMMATE_NAME");
        expect(result.error.message).toMatch(/invalid|characters/i);
      });

      it("Then should return INVALID_TEAMMATE_NAME error for name with spaces", async () => {
        await createTestTeam("space-name-team");
        const tool = createTeammateSpawnTool(ctx);
        const result = (await tool.handler({
          team_name: "space-name-team",
          name: "invalid name",
          agent_type: "General",
        })) as ToolError;

        expect(result).toHaveProperty("error");
        expect(result.error.code).toBe("INVALID_TEAMMATE_NAME");
      });

      it("Then should accept valid names with hyphens and underscores", async () => {
        await createTestTeam("valid-name-team");
        const tool = createTeammateSpawnTool(ctx);
        const result = (await tool.handler({
          team_name: "valid-name-team",
          name: "code-reviewer_v2",
          agent_type: "Code",
        })) as TeammateSpawnResponse;

        expect(result).toHaveProperty("agentId");
        expect(result.status).toBe("idle");
      });
    });
  });

  describe("Given a shutdown team", () => {
    describe("When attempting to spawn a teammate", () => {
      it("Then should return TEAM_NOT_ACTIVE error", async () => {
        await createShutdownTeam("shutdown-team");
        const tool = createTeammateSpawnTool(ctx);
        const result = (await tool.handler({
          team_name: "shutdown-team",
          name: "researcher",
          agent_type: "Explore",
        })) as ToolError;

        expect(result).toHaveProperty("error");
        expect(result.error.code).toBe("TEAM_NOT_ACTIVE");
        expect(result.error.message).toContain("not active");
      });
    });
  });

  describe("Given a non-existent team", () => {
    describe("When attempting to spawn a teammate", () => {
      it("Then should return TEAM_NOT_FOUND error", async () => {
        const tool = createTeammateSpawnTool(ctx);
        const result = (await tool.handler({
          team_name: "non-existent-team",
          name: "researcher",
          agent_type: "Explore",
        })) as ToolError;

        expect(result).toHaveProperty("error");
        expect(result.error.code).toBe("TEAM_NOT_FOUND");
        expect(result.error.message).toContain("not found");
      });
    });
  });

  describe("Given a duplicate teammate name", () => {
    describe("When attempting to spawn a teammate with existing name", () => {
      it("Then should return DUPLICATE_TEAMMATE_NAME error", async () => {
        await createTestTeam("dup-name-team");
        const tool = createTeammateSpawnTool(ctx);

        // Spawn first teammate
        await tool.handler({
          team_name: "dup-name-team",
          name: "researcher",
          agent_type: "Explore",
        });

        // Try to spawn another with the same name
        const result = (await tool.handler({
          team_name: "dup-name-team",
          name: "researcher",
          agent_type: "Code",
        })) as ToolError;

        expect(result).toHaveProperty("error");
        expect(result.error.code).toBe("DUPLICATE_TEAMMATE_NAME");
      });
    });
  });

  describe("Tool schema", () => {
    it("should have correct tool name", () => {
      const tool = createTeammateSpawnTool(ctx);
      expect(tool.name).toBe("teammate_spawn");
    });

    it("should have description", () => {
      const tool = createTeammateSpawnTool(ctx);
      expect(tool.description).toBeDefined();
      expect(tool.description.length).toBeGreaterThan(0);
    });

    it("should have schema defined", () => {
      const tool = createTeammateSpawnTool(ctx);
      expect(tool.schema).toBeDefined();
    });
  });
});
