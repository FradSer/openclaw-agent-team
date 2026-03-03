import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import plugin from "../src/index.js";

// Mock PluginRuntime
interface MockPluginRuntime {
  config: {
    loadConfig: ReturnType<typeof vi.fn>;
    writeConfigFile: ReturnType<typeof vi.fn>;
  };
}

// Mock OpenClaw Plugin API (matching clawdbot-feishu pattern)
interface MockOpenClawPluginApi {
  registerTool: ReturnType<typeof vi.fn>;
  registerChannel: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  logger: {
    info: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    debug?: ReturnType<typeof vi.fn>;
  };
  pluginConfig?: {
    maxTeammatesPerTeam?: number;
    defaultAgentType?: string;
    teamsDir?: string;
  };
  runtime: MockPluginRuntime;
}

// Mock PluginRuntime type
interface MockPluginRuntime {
  config: {
    loadConfig: ReturnType<typeof vi.fn>;
    writeConfigFile: ReturnType<typeof vi.fn>;
  };
}

describe("Plugin Entry Point", () => {
  let mockApi: MockOpenClawPluginApi;
  let tempDir: string;
  let mockRuntime: MockPluginRuntime;

  beforeEach(async () => {
    tempDir = join(process.cwd(), "test-temp", `plugin-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });

    mockRuntime = {
      config: {
        loadConfig: vi.fn().mockResolvedValue({
          agents: { list: [] },
          bindings: [],
        }),
        writeConfigFile: vi.fn().mockResolvedValue(undefined),
      },
    };

    mockApi = {
      registerTool: vi.fn(),
      registerChannel: vi.fn(),
      on: vi.fn(),
      logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
      },
      pluginConfig: {
        maxTeammatesPerTeam: 10,
        defaultAgentType: "general-purpose",
        teamsDir: tempDir,
      },
      runtime: mockRuntime as unknown as MockOpenClawPluginApi["runtime"],
    };
  });

  afterEach(async () => {
    await rm(join(process.cwd(), "test-temp"), { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe("Given the plugin is loaded", () => {
    describe("When inspecting the plugin object", () => {
      it("Then should have correct id", () => {
        expect(plugin).toHaveProperty("id", "openclaw-agent-team");
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
    describe("When using custom teamsDir config", () => {
      it("Then should log the custom teamsDir from pluginConfig", () => {
        plugin.register(mockApi);
        expect(mockApi.logger.info).toHaveBeenCalledWith(
          expect.stringContaining(`teamsDir=${tempDir}`)
        );
      });

      it("Then should log 'not set' when teamsDir is not provided", () => {
        mockApi.pluginConfig = {
          maxTeammatesPerTeam: 5,
        };
        plugin.register(mockApi);
        expect(mockApi.logger.info).toHaveBeenCalledWith(
          expect.stringContaining("pluginConfig.teamsDir=not set")
        );
      });
    });

    describe("When registering tools", () => {
      it("Then should register team_create tool", () => {
        plugin.register(mockApi);
        expect(mockApi.registerTool).toHaveBeenCalledWith(
          expect.objectContaining({ name: "team_create" }),
          expect.objectContaining({ name: "team_create" })
        );
      });

      it("Then should register team_shutdown tool", () => {
        plugin.register(mockApi);
        expect(mockApi.registerTool).toHaveBeenCalledWith(
          expect.objectContaining({ name: "team_shutdown" }),
          expect.objectContaining({ name: "team_shutdown" })
        );
      });

      it("Then should register teammate_spawn tool", () => {
        plugin.register(mockApi);
        expect(mockApi.registerTool).toHaveBeenCalledWith(
          expect.objectContaining({ name: "teammate_spawn" }),
          expect.objectContaining({ name: "teammate_spawn" })
        );
      });

      it("Then should register exactly 3 tools", () => {
        plugin.register(mockApi);
        expect(mockApi.registerTool).toHaveBeenCalledTimes(3);
      });

      it("Then tools should have execute function", () => {
        plugin.register(mockApi);
        const calls = mockApi.registerTool.mock.calls;
        for (const call of calls) {
          expect(call[0]).toHaveProperty("execute");
          expect(typeof call[0].execute).toBe("function");
        }
      });
    });

    describe("When registering hooks", () => {
      // No hooks are currently registered
      it("Then should not register any hooks", () => {
        plugin.register(mockApi);
        expect(mockApi.on).not.toHaveBeenCalled();
      });
    });

    describe("When registration completes", () => {
      it("Then should log success message", () => {
        plugin.register(mockApi);
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

      expect(manifest.id).toBe("openclaw-agent-team");
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
