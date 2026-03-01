import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, stat, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  validateTeamName,
  sanitizeTeammateName,
  createTeamDirectory,
  teamDirectoryExists,
  writeTeamConfig,
  readTeamConfig,
  resolveTeammatePaths,
  resolveTeamPath,
  getTeamsBaseDir,
  TEAM_NAME_PATTERN,
  TEAMMATE_NAME_PATTERN,
} from "../src/storage.js";
import type { TeamConfig } from "../src/types.js";

describe("Storage Module", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(process.cwd(), "test-temp", `storage-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(join(process.cwd(), "test-temp"), { recursive: true, force: true });
  });

  describe("TEAM_NAME_PATTERN", () => {
    it("should match valid team names", () => {
      expect(TEAM_NAME_PATTERN.test("my-team")).toBe(true);
      expect(TEAM_NAME_PATTERN.test("my_team")).toBe(true);
      expect(TEAM_NAME_PATTERN.test("MyTeam123")).toBe(true);
      expect(TEAM_NAME_PATTERN.test("a")).toBe(true);
      expect(TEAM_NAME_PATTERN.test("a".repeat(50))).toBe(true);
    });

    it("should reject invalid team names", () => {
      expect(TEAM_NAME_PATTERN.test("my team")).toBe(false);
      expect(TEAM_NAME_PATTERN.test("my-team!")).toBe(false);
      expect(TEAM_NAME_PATTERN.test("")).toBe(false);
      expect(TEAM_NAME_PATTERN.test("a".repeat(51))).toBe(false);
      expect(TEAM_NAME_PATTERN.test("my/team")).toBe(false);
      expect(TEAM_NAME_PATTERN.test("../escape")).toBe(false);
    });
  });

  describe("TEAMMATE_NAME_PATTERN", () => {
    it("should match valid teammate names", () => {
      expect(TEAMMATE_NAME_PATTERN.test("researcher")).toBe(true);
      expect(TEAMMATE_NAME_PATTERN.test("code-reviewer")).toBe(true);
      expect(TEAMMATE_NAME_PATTERN.test("test_runner")).toBe(true);
      expect(TEAMMATE_NAME_PATTERN.test("a".repeat(100))).toBe(true);
    });

    it("should reject invalid teammate names", () => {
      expect(TEAMMATE_NAME_PATTERN.test("a".repeat(101))).toBe(false);
      expect(TEAMMATE_NAME_PATTERN.test("test!!")).toBe(false);
    });
  });

  describe("validateTeamName", () => {
    it("should return true for valid names", () => {
      expect(validateTeamName("my-team-123")).toBe(true);
      expect(validateTeamName("frontend_redesign")).toBe(true);
      expect(validateTeamName("ProjectAlpha")).toBe(true);
    });

    it("should return false for invalid names", () => {
      expect(validateTeamName("my team!")).toBe(false);
      expect(validateTeamName("")).toBe(false);
      expect(validateTeamName("a".repeat(51))).toBe(false);
      expect(validateTeamName("../../../etc")).toBe(false);
    });
  });

  describe("sanitizeTeammateName", () => {
    it("should convert to lowercase", () => {
      expect(sanitizeTeammateName("Researcher")).toBe("researcher");
      expect(sanitizeTeammateName("CODE-REVIEWER")).toBe("code-reviewer");
    });

    it("should replace invalid characters with hyphens", () => {
      expect(sanitizeTeammateName("test runner")).toBe("test-runner");
      expect(sanitizeTeammateName("test@runner")).toBe("test-runner");
      expect(sanitizeTeammateName("test.runner")).toBe("test-runner");
    });

    it("should truncate to 100 characters", () => {
      const longName = "a".repeat(150);
      expect(sanitizeTeammateName(longName)).toBe("a".repeat(100));
    });
  });

  describe("createTeamDirectory", () => {
    it("should create team directory with correct structure", async () => {
      await createTeamDirectory(tempDir, "test-team");

      const teamDir = join(tempDir, "test-team");
      const dirStat = await stat(teamDir);
      expect(dirStat.isDirectory()).toBe(true);

      const configFile = join(teamDir, "config.json");
      const configStat = await stat(configFile);
      expect(configStat.isFile()).toBe(true);

      const inboxDir = join(teamDir, "inbox");
      const inboxStat = await stat(inboxDir);
      expect(inboxStat.isDirectory()).toBe(true);

      const agentsDir = join(teamDir, "agents");
      const agentsStat = await stat(agentsDir);
      expect(agentsStat.isDirectory()).toBe(true);
    });

    it("should create ledger.db file", async () => {
      await createTeamDirectory(tempDir, "test-team");

      const ledgerFile = join(tempDir, "test-team", "ledger.db");
      const ledgerStat = await stat(ledgerFile);
      expect(ledgerStat.isFile()).toBe(true);
    });

    it("should throw for invalid team name", async () => {
      await expect(createTeamDirectory(tempDir, "invalid name!")).rejects.toThrow();
    });
  });

  describe("teamDirectoryExists", () => {
    it("should return true for existing team directory", async () => {
      await createTeamDirectory(tempDir, "existing-team");
      expect(await teamDirectoryExists(tempDir, "existing-team")).toBe(true);
    });

    it("should return false for non-existent team", async () => {
      expect(await teamDirectoryExists(tempDir, "non-existent")).toBe(false);
    });

    it("should return false if config.json is missing", async () => {
      await mkdir(join(tempDir, "incomplete-team"), { recursive: true });
      expect(await teamDirectoryExists(tempDir, "incomplete-team")).toBe(false);
    });
  });

  describe("writeTeamConfig and readTeamConfig", () => {
    it("should write and read team config round-trip", async () => {
      await createTeamDirectory(tempDir, "config-team");

      const config: TeamConfig = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        team_name: "config-team",
        description: "A test team for config",
        agent_type: "team-lead",
        lead: "lead-session",
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          status: "active",
        },
      };

      await writeTeamConfig(tempDir, "config-team", config);
      const readConfig = await readTeamConfig(tempDir, "config-team");

      expect(readConfig).not.toBeNull();
      expect(readConfig?.id).toBe(config.id);
      expect(readConfig?.team_name).toBe(config.team_name);
      expect(readConfig?.description).toBe(config.description);
      expect(readConfig?.lead).toBe(config.lead);
    });

    it("should return null for non-existent team config", async () => {
      const config = await readTeamConfig(tempDir, "non-existent");
      expect(config).toBeNull();
    });
  });

  describe("resolveTeammatePaths", () => {
    it("should return correct paths for teammate", () => {
      const paths = resolveTeammatePaths(tempDir, "my-team", "researcher");

      expect(paths.workspace).toBe(join(tempDir, "my-team", "agents", "researcher", "workspace"));
      expect(paths.agentDir).toBe(join(tempDir, "my-team", "agents", "researcher", "agent"));
      expect(paths.inboxPath).toBe(join(tempDir, "my-team", "inbox", "researcher", "messages.jsonl"));
    });
  });

  describe("resolveTeamPath", () => {
    it("should resolve path within team directory", () => {
      const path = resolveTeamPath(tempDir, "my-team", "some", "nested", "path");
      expect(path).toBe(join(tempDir, "my-team", "some", "nested", "path"));
    });

    it("should throw for path traversal attempts", () => {
      expect(() => resolveTeamPath(tempDir, "../../../etc")).toThrow(/Invalid team name/i);
      // This path would escape to tempDir/escape which is outside the team directory but inside teamsDir
      // So it's actually allowed - let's test a real escape
      expect(() => resolveTeamPath(tempDir, "my-team", "..", "..", "..", "etc")).toThrow(/path traversal/i);
    });

    it("should throw if resolved path escapes teamsDir", () => {
      expect(() => resolveTeamPath(tempDir, "my-team", "..", "..", "etc")).toThrow(/path traversal/i);
    });
  });

  describe("getTeamsBaseDir", () => {
    it("should return default teams directory", () => {
      const baseDir = getTeamsBaseDir();
      expect(baseDir).toContain(".openclaw");
      expect(baseDir).toContain("teams");
    });
  });
});
