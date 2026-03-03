import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { maybeSpawnTeammate, repairTeammateBinding } from "../src/dynamic-teammate.js";
import { TeamLedger } from "../src/ledger.js";
import { writeTeamConfig } from "../src/storage.js";
import type { TeamConfig } from "../src/types.js";
import type { PluginRuntime, OpenClawConfig } from "openclaw/plugin-sdk";

describe("dynamic-teammate module", () => {
  let tempDir: string;
  let ledger: TeamLedger;
  let mockRuntime: PluginRuntime;
  let mockConfig: OpenClawConfig;
  let logs: string[];

  beforeEach(async () => {
    tempDir = join(process.cwd(), "test-temp", `dynamic-teammate-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });

    // Initialize mock config
    mockConfig = {
      agents: { list: [] },
      bindings: [],
    };

    // Initialize mock runtime
    mockRuntime = {
      config: {
        loadConfig: vi.fn().mockImplementation(() => Promise.resolve(mockConfig)),
        writeConfigFile: vi.fn().mockImplementation((cfg) => {
          mockConfig = cfg;
          return Promise.resolve();
        }),
      },
    } as unknown as PluginRuntime;

    logs = [];
  });

  afterEach(async () => {
    ledger?.close();
    await rm(join(process.cwd(), "test-temp"), { recursive: true, force: true });
  });

  // Helper to create a team with active status
  async function createActiveTeam(teamName: string): Promise<void> {
    const teamDir = join(tempDir, teamName);
    await mkdir(teamDir, { recursive: true });
    await mkdir(join(teamDir, "agents"), { recursive: true });

    const config: TeamConfig = {
      id: `team-${teamName}`,
      team_name: teamName,
      agent_type: "team-lead",
      lead: "leader",
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: "active",
      },
    };
    await writeTeamConfig(tempDir, teamName, config);

    // Create ledger
    const ledgerPath = join(tempDir, teamName, "ledger.db");
    ledger = new TeamLedger(ledgerPath);
  }

  describe("Given a valid spawn request", () => {
    describe("When spawning a new teammate", () => {
      it("Then should create teammate with correct agent ID", async () => {
        await createActiveTeam("test-team");

        const result = await maybeSpawnTeammate({
          teamsDir: tempDir,
          teamName: "test-team",
          teammateName: "researcher",
          maxTeammates: 10,
          runtime: mockRuntime,
          ledger,
          log: (msg) => logs.push(msg),
        });

        expect(result.created).toBe(true);
        expect(result.agentId).toBe("teammate-test-team-researcher");
        expect(result.sessionKey).toBe("agent:teammate-test-team-researcher:main");
        expect(result.teammate).toBeDefined();
        expect(result.teammate?.name).toBe("researcher");
        expect(result.teammate?.status).toBe("idle");
      });

      it("Then should add agent to runtime config", async () => {
        await createActiveTeam("config-team");

        await maybeSpawnTeammate({
          teamsDir: tempDir,
          teamName: "config-team",
          teammateName: "coder",
          agentType: "Code",
          maxTeammates: 10,
          runtime: mockRuntime,
          ledger,
          log: (msg) => logs.push(msg),
        });

        expect(mockConfig.agents?.list).toHaveLength(1);
        expect(mockConfig.agents?.list[0].id).toBe("teammate-config-team-coder");
      });

      it("Then should add binding to runtime config", async () => {
        await createActiveTeam("binding-team");

        await maybeSpawnTeammate({
          teamsDir: tempDir,
          teamName: "binding-team",
          teammateName: "analyst",
          maxTeammates: 10,
          runtime: mockRuntime,
          ledger,
          log: (msg) => logs.push(msg),
        });

        expect(mockConfig.bindings).toHaveLength(1);
        expect(mockConfig.bindings![0].agentId).toBe("teammate-binding-team-analyst");
        expect(mockConfig.bindings![0].match?.channel).toBe("agent-team");
        expect(mockConfig.bindings![0].match?.peer?.id).toBe("binding-team:analyst");
      });

      it("Then should add teammate to ledger", async () => {
        await createActiveTeam("ledger-team");

        await maybeSpawnTeammate({
          teamsDir: tempDir,
          teamName: "ledger-team",
          teammateName: "tester",
          maxTeammates: 10,
          runtime: mockRuntime,
          ledger,
          log: (msg) => logs.push(msg),
        });

        const members = await ledger.listMembers();
        expect(members).toHaveLength(1);
        expect(members[0].name).toBe("tester");
        expect(members[0].agentId).toBe("teammate-ledger-team-tester");
      });

      it("Then should use custom path templates when provided", async () => {
        await createActiveTeam("custom-path-team");

        const result = await maybeSpawnTeammate({
          teamsDir: tempDir,
          teamName: "custom-path-team",
          teammateName: "custom-agent",
          pathTemplates: {
            workspaceTemplate: "{teamsDir}/custom/{teamName}/{teammateName}/ws",
            agentDirTemplate: "{teamsDir}/custom/{teamName}/{teammateName}/agent",
          },
          maxTeammates: 10,
          runtime: mockRuntime,
          ledger,
          log: (msg) => logs.push(msg),
        });

        expect(result.created).toBe(true);
        const agent = mockConfig.agents?.list[0];
        expect(agent?.workspace).toContain("/custom/custom-path-team/custom-agent/ws");
        expect(agent?.agentDir).toContain("/custom/custom-path-team/custom-agent/agent");
      });

      it("Then should store optional model and tools configuration", async () => {
        await createActiveTeam("options-team");

        const result = await maybeSpawnTeammate({
          teamsDir: tempDir,
          teamName: "options-team",
          teammateName: "configured-agent",
          model: "claude-opus-4-6",
          tools: {
            allow: ["read_file", "write_file"],
            deny: ["execute_command"],
          },
          maxTeammates: 10,
          runtime: mockRuntime,
          ledger,
          log: (msg) => logs.push(msg),
        });

        expect(result.teammate?.model).toBe("claude-opus-4-6");
        expect(result.teammate?.tools?.allow).toEqual(["read_file", "write_file"]);
        expect(result.teammate?.tools?.deny).toEqual(["execute_command"]);
      });
    });
  });

  describe("Given an invalid teammate name", () => {
    describe("When spawning with special characters", () => {
      it("Then should return INVALID_TEAMMATE_NAME error", async () => {
        await createActiveTeam("invalid-name-team");

        const result = await maybeSpawnTeammate({
          teamsDir: tempDir,
          teamName: "invalid-name-team",
          teammateName: "invalid!!",
          maxTeammates: 10,
          runtime: mockRuntime,
          ledger,
          log: (msg) => logs.push(msg),
        });

        expect(result.created).toBe(false);
        expect(result.error?.code).toBe("INVALID_TEAMMATE_NAME");
      });
    });
  });

  describe("Given a team at maximum capacity", () => {
    describe("When spawning another teammate", () => {
      it("Then should return TEAM_AT_CAPACITY error", async () => {
        await createActiveTeam("capacity-team");

        // Spawn max teammates
        for (let i = 0; i < 5; i++) {
          await maybeSpawnTeammate({
            teamsDir: tempDir,
            teamName: "capacity-team",
            teammateName: `agent-${i}`,
            maxTeammates: 5,
            runtime: mockRuntime,
            ledger,
            log: (msg) => logs.push(msg),
          });
        }

        // Try to spawn one more
        const result = await maybeSpawnTeammate({
          teamsDir: tempDir,
          teamName: "capacity-team",
          teammateName: "agent-6",
          maxTeammates: 5,
          runtime: mockRuntime,
          ledger,
          log: (msg) => logs.push(msg),
        });

        expect(result.created).toBe(false);
        expect(result.error?.code).toBe("TEAM_AT_CAPACITY");
      });
    });
  });

  describe("Given a duplicate teammate name", () => {
    describe("When spawning with existing name", () => {
      it("Then should return DUPLICATE_TEAMMATE_NAME error", async () => {
        await createActiveTeam("dup-team");

        await maybeSpawnTeammate({
          teamsDir: tempDir,
          teamName: "dup-team",
          teammateName: "researcher",
          maxTeammates: 10,
          runtime: mockRuntime,
          ledger,
          log: (msg) => logs.push(msg),
        });

        const result = await maybeSpawnTeammate({
          teamsDir: tempDir,
          teamName: "dup-team",
          teammateName: "researcher",
          maxTeammates: 10,
          runtime: mockRuntime,
          ledger,
          log: (msg) => logs.push(msg),
        });

        expect(result.created).toBe(false);
        expect(result.error?.code).toBe("DUPLICATE_TEAMMATE_NAME");
      });
    });
  });

  describe("Given a shutdown team", () => {
    describe("When spawning a teammate", () => {
      it("Then should return TEAM_NOT_ACTIVE error", async () => {
        await createActiveTeam("shutdown-team");

        // Update team status to shutdown
        const config = await ledger.listMembers(); // ensure ledger loaded
        const teamConfig: TeamConfig = {
          id: "team-shutdown-team",
          team_name: "shutdown-team",
          agent_type: "team-lead",
          lead: "leader",
          metadata: {
            createdAt: Date.now(),
            updatedAt: Date.now(),
            status: "shutdown",
          },
        };
        await writeTeamConfig(tempDir, "shutdown-team", teamConfig);

        const result = await maybeSpawnTeammate({
          teamsDir: tempDir,
          teamName: "shutdown-team",
          teammateName: "researcher",
          maxTeammates: 10,
          runtime: mockRuntime,
          ledger,
          log: (msg) => logs.push(msg),
        });

        expect(result.created).toBe(false);
        expect(result.error?.code).toBe("TEAM_NOT_ACTIVE");
      });
    });
  });

  describe("Given an agent exists in config but binding is missing", () => {
    describe("When calling repairTeammateBinding", () => {
      it("Then should add missing binding", async () => {
        await createActiveTeam("repair-team");

        // First spawn a teammate
        await maybeSpawnTeammate({
          teamsDir: tempDir,
          teamName: "repair-team",
          teammateName: "repair-agent",
          maxTeammates: 10,
          runtime: mockRuntime,
          ledger,
          log: (msg) => logs.push(msg),
        });

        // Remove the binding to simulate partial state
        mockConfig.bindings = [];
        mockRuntime.config.loadConfig = vi.fn().mockResolvedValue(mockConfig);

        const result = await repairTeammateBinding({
          teamName: "repair-team",
          teammateName: "repair-agent",
          agentId: "teammate-repair-team-repair-agent",
          runtime: mockRuntime,
          log: (msg) => logs.push(msg),
        });

        expect(result.repaired).toBe(true);
        expect(mockConfig.bindings).toHaveLength(1);
      });
    });

    describe("When binding already exists", () => {
      it("Then should return repaired: false", async () => {
        await createActiveTeam("no-repair-team");

        // Spawn with binding
        await maybeSpawnTeammate({
          teamsDir: tempDir,
          teamName: "no-repair-team",
          teammateName: "bound-agent",
          maxTeammates: 10,
          runtime: mockRuntime,
          ledger,
          log: (msg) => logs.push(msg),
        });

        const initialBindings = mockConfig.bindings?.length ?? 0;

        const result = await repairTeammateBinding({
          teamName: "no-repair-team",
          teammateName: "bound-agent",
          agentId: "teammate-no-repair-team-bound-agent",
          runtime: mockRuntime,
          log: (msg) => logs.push(msg),
        });

        expect(result.repaired).toBe(false);
        expect(mockConfig.bindings).toHaveLength(initialBindings);
      });
    });
  });
});