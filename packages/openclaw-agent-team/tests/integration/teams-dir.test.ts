import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, access } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import plugin from "../../src/index.js";

// Mock PluginRuntime
interface MockPluginRuntime {
  config: {
    loadConfig: ReturnType<typeof vi.fn>;
    writeConfigFile: ReturnType<typeof vi.fn>;
  };
}

// Mock OpenClaw Plugin API
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

describe("Integration: teamsDir Configuration", () => {
  let mockApi: MockOpenClawPluginApi;
  let customTeamsDir: string;
  let mockRuntime: MockPluginRuntime;

  describe("Given the plugin is configured with custom teamsDir", () => {
    beforeEach(async () => {
      customTeamsDir = join(process.cwd(), "test-temp", `teams-dir-test-${Date.now()}`);
      await mkdir(customTeamsDir, { recursive: true });

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
          teamsDir: customTeamsDir,
        },
        runtime: mockRuntime as unknown as MockOpenClawPluginApi["runtime"],
      };
    });

    afterEach(async () => {
      await rm(join(process.cwd(), "test-temp"), { recursive: true, force: true });
      vi.clearAllMocks();
    });

    describe("When the plugin is registered", () => {
      it("Then should use the custom teamsDir", () => {
        plugin.register(mockApi);

        // The plugin should log the custom teamsDir
        expect(mockApi.logger.info).toHaveBeenCalledWith(
          expect.stringContaining(`teamsDir=${customTeamsDir}`)
        );
      });

      it("Then should not use the default teamsDir", () => {
        plugin.register(mockApi);

        const defaultTeamsDir = join(homedir(), ".openclaw", "teams");
        expect(mockApi.logger.info).not.toHaveBeenCalledWith(
          expect.stringContaining(`teamsDir=${defaultTeamsDir}`)
        );
      });
    });
  });

  describe("Given the plugin is configured without teamsDir", () => {
    beforeEach(async () => {
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
          maxTeammatesPerTeam: 5,
        },
        runtime: mockRuntime as unknown as MockOpenClawPluginApi["runtime"],
      };
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    describe("When the plugin is registered", () => {
      it("Then should use the default teamsDir", () => {
        plugin.register(mockApi);

        const defaultTeamsDir = join(homedir(), ".openclaw", "teams");
        expect(mockApi.logger.info).toHaveBeenCalledWith(
          expect.stringContaining(`teamsDir=${defaultTeamsDir}`)
        );
      });

      it("Then should log 'not set' for pluginConfig.teamsDir", () => {
        plugin.register(mockApi);

        expect(mockApi.logger.info).toHaveBeenCalledWith(
          expect.stringContaining("pluginConfig.teamsDir=not set")
        );
      });
    });
  });
});
