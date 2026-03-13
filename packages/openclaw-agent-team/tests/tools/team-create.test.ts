import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { createTeamCreateTool } from "../../src/tools/team-create.js";
import type { TeamConfig } from "../../src/types.js";

// Type definitions based on the expected API
interface TeamCreateResponse {
  teamId: string;
  teamName: string;
  status: "active";
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

// Simulates the agentId provided by the SDK tool factory context
const CALLER_ID = "test-agent";

describe("team_create tool", () => {
  let tempDir: string;
  let ctx: PluginContext;

  beforeEach(async () => {
    tempDir = join(process.cwd(), "test-temp", `team-create-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
    ctx = { teamsDir: tempDir };
  });

  afterEach(async () => {
    await rm(join(process.cwd(), "test-temp"), { recursive: true, force: true });
  });

  describe("Given a valid team creation request", () => {
    describe("When creating a team with minimal parameters", () => {
      it("Then should return teamId as valid UUID, status 'active', and create directory structure", async () => {
        const tool = createTeamCreateTool(ctx);
        const result = (await tool.handler({ team_name: "my-team" }, CALLER_ID)) as TeamCreateResponse;

        expect(result).toHaveProperty("teamId");
        expect(result).toHaveProperty("teamName");
        expect(result).toHaveProperty("status");

        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        expect(result.teamId).toMatch(uuidPattern);
        expect(result.teamName).toBe("my-team");
        expect(result.status).toBe("active");

        const teamDir = join(tempDir, "my-team");
        expect((await stat(teamDir)).isDirectory()).toBe(true);
        expect((await stat(join(teamDir, "config.json"))).isFile()).toBe(true);
        expect((await stat(join(teamDir, "agents"))).isDirectory()).toBe(true);
      });

      it("Then should write team config with UUID matching response", async () => {
        const tool = createTeamCreateTool(ctx);
        const result = (await tool.handler({ team_name: "config-test-team" }, CALLER_ID)) as TeamCreateResponse;

        const { readFile } = await import("node:fs/promises");
        const configContent = await readFile(join(tempDir, "config-test-team", "config.json"), "utf-8");
        const config = JSON.parse(configContent) as TeamConfig;

        expect(config.id).toBe(result.teamId);
        expect(config.team_name).toBe("config-test-team");
        expect(config.metadata.status).toBe("active");
      });
    });

    describe("When creating a team with a caller agent ID", () => {
      it("Then should record the caller as team lead", async () => {
        const tool = createTeamCreateTool(ctx);
        await tool.handler({ team_name: "led-team" }, CALLER_ID);

        const { readFile } = await import("node:fs/promises");
        const configContent = await readFile(join(tempDir, "led-team", "config.json"), "utf-8");
        const config = JSON.parse(configContent) as TeamConfig;

        expect(config.lead).toBe(CALLER_ID);
      });

      it("Then should return UNAUTHORIZED error when no caller ID provided", async () => {
        const tool = createTeamCreateTool(ctx);
        const result = (await tool.handler({ team_name: "valid-name" })) as ToolError;

        expect(result).toHaveProperty("error");
        expect(result.error.code).toBe("MISSING_CALLER_AGENT_ID");
      });
    });

    describe("When creating a team with optional parameters", () => {
      it("Then should accept description and use default agent_type", async () => {
        const tool = createTeamCreateTool(ctx);
        const result = (await tool.handler(
          { team_name: "described-team", description: "A team with a description" },
          CALLER_ID
        )) as TeamCreateResponse;

        expect(result.teamName).toBe("described-team");
        expect(result.status).toBe("active");

        const { readFile } = await import("node:fs/promises");
        const configContent = await readFile(join(tempDir, "described-team", "config.json"), "utf-8");
        const config = JSON.parse(configContent) as TeamConfig;

        expect(config.description).toBe("A team with a description");
        expect(config.agent_type).toBe("team-lead");
      });

      it("Then should accept custom agent_type", async () => {
        const tool = createTeamCreateTool(ctx);
        await tool.handler({ team_name: "custom-agent-team", agent_type: "custom-lead" }, CALLER_ID);

        const { readFile } = await import("node:fs/promises");
        const configContent = await readFile(join(tempDir, "custom-agent-team", "config.json"), "utf-8");
        const config = JSON.parse(configContent) as TeamConfig;

        expect(config.agent_type).toBe("custom-lead");
      });
    });
  });

  describe("Given a duplicate team name", () => {
    describe("When attempting to create a team with existing name", () => {
      it("Then should return DUPLICATE_TEAM_NAME error", async () => {
        const tool = createTeamCreateTool(ctx);

        const firstResult = (await tool.handler({ team_name: "duplicate-test" }, CALLER_ID)) as TeamCreateResponse;
        expect(firstResult.status).toBe("active");

        const secondResult = (await tool.handler({ team_name: "duplicate-test" }, CALLER_ID)) as ToolError;
        expect(secondResult).toHaveProperty("error");
        expect(secondResult.error.code).toBe("DUPLICATE_TEAM_NAME");
        expect(secondResult.error.message).toContain("already exists");
      });
    });
  });

  describe("Given an invalid team name with special characters", () => {
    describe("When attempting to create a team with special characters", () => {
      it("Then should return INVALID_TEAM_NAME error for spaces", async () => {
        const tool = createTeamCreateTool(ctx);
        const result = (await tool.handler({ team_name: "invalid name" })) as ToolError;

        expect(result).toHaveProperty("error");
        expect(result.error.code).toBe("INVALID_TEAM_NAME");
        expect(result.error.message).toMatch(/invalid|characters/i);
      });

      it("Then should return INVALID_TEAM_NAME error for exclamation mark", async () => {
        const tool = createTeamCreateTool(ctx);
        const result = (await tool.handler({ team_name: "team!" })) as ToolError;

        expect(result).toHaveProperty("error");
        expect(result.error.code).toBe("INVALID_TEAM_NAME");
      });

      it("Then should return INVALID_TEAM_NAME error for at symbol", async () => {
        const tool = createTeamCreateTool(ctx);
        const result = (await tool.handler({ team_name: "team@name" })) as ToolError;

        expect(result).toHaveProperty("error");
        expect(result.error.code).toBe("INVALID_TEAM_NAME");
      });

      it("Then should return INVALID_TEAM_NAME error for path traversal attempt", async () => {
        const tool = createTeamCreateTool(ctx);
        const result = (await tool.handler({ team_name: "../escape" })) as ToolError;

        expect(result).toHaveProperty("error");
        expect(result.error.code).toBe("INVALID_TEAM_NAME");
      });
    });
  });

  describe("Given a team name that is too long", () => {
    describe("When attempting to create a team with name exceeding 50 characters", () => {
      it("Then should return TEAM_NAME_TOO_LONG error", async () => {
        const tool = createTeamCreateTool(ctx);
        const result = (await tool.handler({ team_name: "a".repeat(51) })) as ToolError;

        expect(result).toHaveProperty("error");
        expect(result.error.code).toBe("TEAM_NAME_TOO_LONG");
        expect(result.error.message).toMatch(/too long|exceed|50/i);
      });

      it("Then should accept team name with exactly 50 characters", async () => {
        const tool = createTeamCreateTool(ctx);
        const maxName = "a".repeat(50);
        const result = (await tool.handler({ team_name: maxName }, CALLER_ID)) as TeamCreateResponse;

        expect(result.status).toBe("active");
        expect(result.teamName).toBe(maxName);
      });
    });
  });

  describe("Given an empty team name", () => {
    describe("When attempting to create a team with empty string", () => {
      it("Then should return EMPTY_TEAM_NAME error", async () => {
        const tool = createTeamCreateTool(ctx);
        const result = (await tool.handler({ team_name: "" })) as ToolError;

        expect(result).toHaveProperty("error");
        expect(result.error.code).toBe("EMPTY_TEAM_NAME");
        expect(result.error.message).toMatch(/empty|required/i);
      });
    });
  });

  describe("Tool schema", () => {
    it("should have correct tool name", () => {
      expect(createTeamCreateTool(ctx).name).toBe("team_create");
    });

    it("should have description", () => {
      const desc = createTeamCreateTool(ctx).description;
      expect(desc).toBeDefined();
      expect(desc.length).toBeGreaterThan(0);
    });

    it("should have schema defined", () => {
      expect(createTeamCreateTool(ctx).schema).toBeDefined();
    });
  });
});
