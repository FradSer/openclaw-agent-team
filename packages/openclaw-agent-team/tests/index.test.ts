import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import plugin from "../src/index.js";

// Mock OpenClaw Plugin API
interface MockTool {
  label: string;
  name: string;
  description: string;
  schema: unknown;
  handler: (params: unknown) => Promise<unknown>;
}

interface MockOpenClawPluginApi {
  registerTool: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  logger: {
    info: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
  };
  config: {
    get: ReturnType<typeof vi.fn>;
  };
  spawnAgent: ReturnType<typeof vi.fn>;
  removeAgent: ReturnType<typeof vi.fn>;
  sendMessage: ReturnType<typeof vi.fn>;
  requestHeartbeatWake: ReturnType<typeof vi.fn>;
}

describe("Plugin Entry Point", () => {
  let mockApi: MockOpenClawPluginApi;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(process.cwd(), "test-temp", `plugin-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });

    mockApi = {
      registerTool: vi.fn(),
      on: vi.fn(),
      logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
      },
      config: {
        get: vi.fn().mockReturnValue({
          maxTeammatesPerTeam: 10,
          defaultAgentType: "general-purpose",
          teamsDir: tempDir,
        }),
      },
      spawnAgent: vi.fn(),
      removeAgent: vi.fn(),
      sendMessage: vi.fn(),
      requestHeartbeatWake: vi.fn(),
    };
  });

  afterEach(async () => {
    await rm(join(process.cwd(), "test-temp"), { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe("Given the plugin is loaded", () => {
    describe("When inspecting the plugin object", () => {
      it("Then should have correct id", () => {
        expect(plugin).toHaveProperty("id", "agent-team");
      });

      it("Then should have correct name", () => {
        expect(plugin).toHaveProperty("name", "Agent Team");
      });

      it("Then should have description", () => {
        expect(plugin).toHaveProperty("description");
        expect(plugin.description).toContain("team");
      });

      it("Then should have configSchema", () => {
        expect(plugin).toHaveProperty("configSchema");
      });

      it("Then should have register function", () => {
        expect(plugin).toHaveProperty("register");
        expect(typeof plugin.register).toBe("function");
      });
    });
  });

  describe("Given the register function is called", () => {
    describe("When registering tools", () => {
      it("Then should register team_create tool", async () => {
        await plugin.register(mockApi);
        expect(mockApi.registerTool).toHaveBeenCalledWith(
          expect.objectContaining({ name: "team_create" })
        );
      });

      it("Then should register team_shutdown tool", async () => {
        await plugin.register(mockApi);
        expect(mockApi.registerTool).toHaveBeenCalledWith(
          expect.objectContaining({ name: "team_shutdown" })
        );
      });

      it("Then should register teammate_spawn tool", async () => {
        await plugin.register(mockApi);
        expect(mockApi.registerTool).toHaveBeenCalledWith(
          expect.objectContaining({ name: "teammate_spawn" })
        );
      });

      it("Then should register task_create tool", async () => {
        await plugin.register(mockApi);
        expect(mockApi.registerTool).toHaveBeenCalledWith(
          expect.objectContaining({ name: "task_create" })
        );
      });

      it("Then should register task_list tool", async () => {
        await plugin.register(mockApi);
        expect(mockApi.registerTool).toHaveBeenCalledWith(
          expect.objectContaining({ name: "task_list" })
        );
      });

      it("Then should register task_claim tool", async () => {
        await plugin.register(mockApi);
        expect(mockApi.registerTool).toHaveBeenCalledWith(
          expect.objectContaining({ name: "task_claim" })
        );
      });

      it("Then should register task_complete tool", async () => {
        await plugin.register(mockApi);
        expect(mockApi.registerTool).toHaveBeenCalledWith(
          expect.objectContaining({ name: "task_complete" })
        );
      });

      it("Then should register send_message tool", async () => {
        await plugin.register(mockApi);
        expect(mockApi.registerTool).toHaveBeenCalledWith(
          expect.objectContaining({ name: "send_message" })
        );
      });

      it("Then should register inbox tool", async () => {
        await plugin.register(mockApi);
        expect(mockApi.registerTool).toHaveBeenCalledWith(
          expect.objectContaining({ name: "inbox" })
        );
      });

      it("Then should register exactly 9 tools", async () => {
        await plugin.register(mockApi);
        expect(mockApi.registerTool).toHaveBeenCalledTimes(9);
      });
    });

    describe("When registering hooks", () => {
      it("Then should register before_prompt_build hook", async () => {
        await plugin.register(mockApi);
        expect(mockApi.on).toHaveBeenCalledWith(
          "before_prompt_build",
          expect.any(Function)
        );
      });
    });

    describe("When registration completes", () => {
      it("Then should log success message", async () => {
        await plugin.register(mockApi);
        expect(mockApi.logger.info).toHaveBeenCalledWith(
          expect.stringContaining("[agent-team]")
        );
      });
    });
  });

  describe("Given the plugin manifest file", () => {
    it("Then should exist and be valid JSON", async () => {
      const manifestPath = join(process.cwd(), "openclaw.plugin.json");
      const content = await readFile(manifestPath, "utf-8");
      const manifest = JSON.parse(content);

      expect(manifest).toBeDefined();
    });

    it("Then should have correct id", async () => {
      const manifestPath = join(process.cwd(), "openclaw.plugin.json");
      const content = await readFile(manifestPath, "utf-8");
      const manifest = JSON.parse(content);

      expect(manifest.id).toBe("agent-team");
    });

    it("Then should have correct name", async () => {
      const manifestPath = join(process.cwd(), "openclaw.plugin.json");
      const content = await readFile(manifestPath, "utf-8");
      const manifest = JSON.parse(content);

      expect(manifest.name).toBe("Agent Team");
    });

    it("Then should have description", async () => {
      const manifestPath = join(process.cwd(), "openclaw.plugin.json");
      const content = await readFile(manifestPath, "utf-8");
      const manifest = JSON.parse(content);

      expect(manifest.description).toBeDefined();
    });

    it("Then should have version", async () => {
      const manifestPath = join(process.cwd(), "openclaw.plugin.json");
      const content = await readFile(manifestPath, "utf-8");
      const manifest = JSON.parse(content);

      expect(manifest.version).toBeDefined();
    });

    it("Then should have main entry point", async () => {
      const manifestPath = join(process.cwd(), "openclaw.plugin.json");
      const content = await readFile(manifestPath, "utf-8");
      const manifest = JSON.parse(content);

      expect(manifest.main).toBeDefined();
      expect(manifest.main).toMatch(/dist\/index\.js$/);
    });
  });
});
