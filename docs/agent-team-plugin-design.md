# Agent Team Plugin Design

## Overview

This document outlines the design for converting OpenClaw's Agent Team functionality into a standalone plugin, following the pattern established by `@m1heng-clawd/feishu`.

## Plugin Package Structure

```
@openclaw/agent-team/
├── index.ts                    # Plugin entry point
├── openclaw.plugin.json        # Plugin manifest
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── types.ts                # Team, Task, Member types
│   ├── manager.ts              # TeamManager implementation
│   ├── ledger.ts               # SQLite-based persistence
│   ├── storage.ts              # Directory/config management
│   ├── pool.ts                 # Team manager pooling
│   ├── inbox.ts                # Message routing
│   ├── context-injection.ts    # Team state injection
│   ├── tools/
│   │   ├── register.ts         # Tool registration helper
│   │   ├── team-create.ts      # team_create tool
│   │   ├── team-shutdown.ts    # team_shutdown tool
│   │   ├── teammate-spawn.ts   # teammate_spawn tool
│   │   ├── task-create.ts      # task_create tool
│   │   ├── task-list.ts        # task_list tool
│   │   ├── task-claim.ts       # task_claim tool
│   │   ├── task-complete.ts    # task_complete tool
│   │   ├── send-message.ts     # send_message tool
│   │   └── inbox.ts            # inbox tool
│   ├── runtime/
│   │   └── subagent.ts         # Subagent creation/management
│   └── __tests__/
│       └── ...
├── skills/
│   └── team-lead/
│       └── SKILL.md
└── README.md
```

## package.json

```json
{
  "name": "@openclaw/agent-team",
  "version": "0.1.0",
  "type": "module",
  "description": "OpenClaw Agent Team plugin for multi-agent coordination",
  "scripts": {
    "test:unit": "vitest run",
    "test:unit:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "ci:check": "npx tsc --noEmit && npm run test:coverage"
  },
  "license": "MIT",
  "files": [
    "index.ts",
    "src/**/*.ts",
    "!src/**/__tests__/**",
    "!src/**/*.test.ts",
    "skills",
    "openclaw.plugin.json"
  ],
  "keywords": [
    "openclaw",
    "agent-team",
    "multi-agent",
    "coordination",
    "tasks"
  ],
  "openclaw": {
    "extensions": [
      "./index.ts"
    ],
    "install": {
      "npmSpec": "@openclaw/agent-team",
      "localPath": "extensions/agent-team",
      "defaultChoice": "npm"
    }
  },
  "dependencies": {
    "@sinclair/typebox": "0.34.48",
    "better-sqlite3": "^11.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/node": "^25.0.10",
    "openclaw": ">=2026.2.13",
    "typescript": "^5.7.0",
    "vitest": "^2.1.8"
  },
  "peerDependencies": {
    "openclaw": ">=2026.2.13"
  }
}
```

## openclaw.plugin.json

```json
{
  "id": "agent-team",
  "skills": ["./skills"],
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "maxTeammatesPerTeam": {
        "type": "integer",
        "minimum": 1,
        "maximum": 20,
        "default": 10
      },
      "defaultAgentType": {
        "type": "string",
        "default": "general-purpose"
      },
      "taskRetentionDays": {
        "type": "integer",
        "minimum": 1,
        "default": 30
      },
      "enableAutoClaim": {
        "type": "boolean",
        "default": true
      }
    }
  },
  "uiHints": {
    "maxTeammatesPerTeam": {
      "label": "Max Teammates per Team",
      "help": "Maximum number of agents that can join a single team"
    },
    "defaultAgentType": {
      "label": "Default Agent Type",
      "placeholder": "general-purpose"
    },
    "taskRetentionDays": {
      "label": "Task Retention (days)",
      "help": "How long to keep completed tasks before cleanup"
    },
    "enableAutoClaim": {
      "label": "Enable Auto-Claim",
      "help": "Allow teammates to automatically claim available tasks"
    }
  }
}
```

## index.ts (Plugin Entry Point)

```typescript
import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi, OpenClawPluginConfigSchema } from "openclaw/plugin-sdk";
import { registerTeamTools } from "./src/tools/register.js";
import { createTeamManager, type TeamManager } from "./src/manager.js";
import { getTeamsBaseDir, initializeTeamsStorage } from "./src/storage.js";

export type { Team, Task, TeamMember, TeamMessage } from "./src/types.js";
export { TeamManager } from "./src/manager.js";

const AgentTeamConfigSchema: OpenClawPluginConfigSchema = {
  parse(value: unknown) {
    const raw = value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

    return {
      maxTeammatesPerTeam: typeof raw.maxTeammatesPerTeam === "number"
        ? raw.maxTeammatesPerTeam
        : 10,
      defaultAgentType: typeof raw.defaultAgentType === "string"
        ? raw.defaultAgentType
        : "general-purpose",
      taskRetentionDays: typeof raw.taskRetentionDays === "number"
        ? raw.taskRetentionDays
        : 30,
      enableAutoClaim: raw.enableAutoClaim !== false,
    };
  },
  uiHints: {
    maxTeammatesPerTeam: {
      label: "Max Teammates per Team",
      help: "Maximum number of agents that can join a single team",
    },
    defaultAgentType: {
      label: "Default Agent Type",
      placeholder: "general-purpose",
    },
    taskRetentionDays: {
      label: "Task Retention (days)",
      help: "How long to keep completed tasks before cleanup",
    },
    enableAutoClaim: {
      label: "Enable Auto-Claim",
      help: "Allow teammates to automatically claim available tasks",
    },
  },
};

const agentTeamPlugin = {
  id: "agent-team",
  name: "Agent Team",
  description: "Multi-agent team coordination with shared task ledger",
  configSchema: AgentTeamConfigSchema,

  async register(api: OpenClawPluginApi) {
    const config = AgentTeamConfigSchema.parse(api.pluginConfig);
    const teamsDir = getTeamsBaseDir();

    // Initialize storage
    await initializeTeamsStorage(teamsDir);

    // Register agent tools
    registerTeamTools(api, { config, teamsDir });

    // Register background service for cleanup
    api.registerService({
      id: "agent-team-cleanup",
      start: async () => {
        api.logger.info("[agent-team] Cleanup service started");
      },
      stop: async () => {
        api.logger.info("[agent-team] Cleanup service stopped");
      },
    });

    // Register hooks for team state injection
    api.on("before_prompt_build", async (event, ctx) => {
      // Inject team context if this is a teammate session
      // This would require access to session metadata
      return {};
    });

    api.logger.info("[agent-team] Plugin registered successfully");
  },
};

export default agentTeamPlugin;
```

## Required Plugin SDK Enhancements

For this plugin to work, the following APIs need to be added to `openclaw/plugin-sdk`:

### 1. Subagent API

```typescript
// In openclaw/plugin-sdk
export type SubagentApi = {
  /**
   * Create a new agent session for a teammate
   */
  createTeammateSession(options: {
    teamName: string;
    teammateName: string;
    agentType?: string;
    model?: string;
    initialContext?: string;
    parentSessionKey?: string;
  }): Promise<{
    sessionKey: string;
    agentId: string;
    runId?: string;
  }>;

  /**
   * Send a message to an agent session
   */
  sendToSession(options: {
    sessionKey: string;
    message: string;
    deliver?: boolean;
  }): Promise<{ runId: string }>;

  /**
   * Terminate an agent session
   */
  terminateSession(sessionKey: string): Promise<void>;

  /**
   * Get session status
   */
  getSessionStatus(sessionKey: string): Promise<{
    exists: boolean;
    active?: boolean;
    lastActiveAt?: number;
  }>;
};

// Add to OpenClawPluginApi
export type OpenClawPluginApi = {
  // ... existing fields
  subagent: SubagentApi;
};
```

### 2. Team Storage API

```typescript
// In openclaw/plugin-sdk
export type TeamStorageApi = {
  /**
   * Get the base directory for team storage
   */
  getTeamsBaseDir(): string;

  /**
   * Resolve a path within the team storage
   */
  resolveTeamPath(teamName: string, ...paths: string[]): string;
};

// Add to OpenClawPluginApi
export type OpenClawPluginApi = {
  // ... existing fields
  storage: {
    teams: TeamStorageApi;
  };
};
```

### 3. Message Routing API

```typescript
// In openclaw/plugin-sdk
export type MessageRoutingApi = {
  /**
   * Register a message handler for a session
   */
  registerMessageHandler(options: {
    sessionKey: string;
    handler: (message: IncomingMessage) => Promise<void> | void;
  }): void;

  /**
   * Unregister a message handler
   */
  unregisterMessageHandler(sessionKey: string): void;
};

// Add to OpenClawPluginApi
export type OpenClawPluginApi = {
  // ... existing fields
  messaging: MessageRoutingApi;
};
```

## Tools Implementation

### src/tools/register.ts

```typescript
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { createTeamCreateTool } from "./team-create.js";
import { createTeamShutdownTool } from "./team-shutdown.js";
import { createTeammateSpawnTool } from "./teammate-spawn.js";
import { createTaskCreateTool } from "./task-create.js";
import { createTaskListTool } from "./task-list.js";
import { createTaskClaimTool } from "./task-claim.js";
import { createTaskCompleteTool } from "./task-complete.js";
import { createSendMessageTool } from "./send-message.js";
import { createInboxTool } from "./inbox.js";

interface RegisterOptions {
  config: {
    maxTeammatesPerTeam: number;
    defaultAgentType: string;
    taskRetentionDays: number;
    enableAutoClaim: boolean;
  };
  teamsDir: string;
}

export function registerTeamTools(api: OpenClawPluginApi, options: RegisterOptions) {
  const toolContext = {
    api,
    config: options.config,
    teamsDir: options.teamsDir,
  };

  // Team management tools
  api.registerTool(createTeamCreateTool(toolContext), { name: "team_create" });
  api.registerTool(createTeamShutdownTool(toolContext), { name: "team_shutdown" });

  // Teammate management tools
  api.registerTool(createTeammateSpawnTool(toolContext), { name: "teammate_spawn" });

  // Task management tools
  api.registerTool(createTaskCreateTool(toolContext), { name: "task_create" });
  api.registerTool(createTaskListTool(toolContext), { name: "task_list" });
  api.registerTool(createTaskClaimTool(toolContext), { name: "task_claim" });
  api.registerTool(createTaskCompleteTool(toolContext), { name: "task_complete" });

  // Communication tools
  api.registerTool(createSendMessageTool(toolContext), { name: "send_message" });
  api.registerTool(createInboxTool(toolContext), { name: "inbox" });

  api.logger.info("[agent-team] Registered 9 tools");
}
```

### src/tools/team-create.ts

```typescript
import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi, AnyAgentTool } from "openclaw/plugin-sdk";
import { jsonResult, readStringParam } from "openclaw/plugin-sdk";
import { createTeamDirectory, writeTeamConfig, teamDirectoryExists, validateTeamNameOrThrow } from "../storage.js";
import { getTeamManager } from "../pool.js";

const TeamCreateSchema = Type.Object({
  team_name: Type.String({ minLength: 1, maxLength: 50 }),
  description: Type.Optional(Type.String()),
  agent_type: Type.Optional(Type.String()),
});

interface ToolContext {
  api: OpenClawPluginApi;
  config: {
    maxTeammatesPerTeam: number;
    defaultAgentType: string;
  };
  teamsDir: string;
}

export function createTeamCreateTool(ctx: ToolContext): AnyAgentTool {
  return {
    label: "Team Create",
    name: "team_create",
    description: "Creates a new team for multi-agent coordination with a shared task ledger.",
    parameters: TeamCreateSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;

      const teamName = readStringParam(params, "team_name", { required: true });
      const description = readStringParam(params, "description");
      const agentType = readStringParam(params, "agent_type");

      try {
        validateTeamNameOrThrow(teamName);

        if (await teamDirectoryExists(ctx.teamsDir, teamName)) {
          return jsonResult({
            error: `Team '${teamName}' already exists. Choose a different name.`,
          });
        }

        await createTeamDirectory(ctx.teamsDir, teamName);

        const teamId = crypto.randomUUID();
        const now = Date.now();

        const config = {
          team_name: teamName,
          id: teamId,
          description: description ?? "",
          agent_type: agentType ?? ctx.config.defaultAgentType,
          metadata: {
            createdAt: now,
            updatedAt: now,
            status: "active",
          },
        };

        await writeTeamConfig(ctx.teamsDir, teamName, config);

        const manager = getTeamManager(teamName, ctx.teamsDir);
        // Note: Team lead registration would require the subagent API

        return jsonResult({
          teamId,
          teamName,
          status: "active",
          message: `Team '${teamName}' created successfully with ID ${teamId}`,
        });
      } catch (err) {
        return jsonResult({
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}
```

### src/tools/teammate-spawn.ts

```typescript
import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi, AnyAgentTool } from "openclaw/plugin-sdk";
import { jsonResult, readStringParam } from "openclaw/plugin-sdk";
import { getTeamManager } from "../pool.js";
import { teamDirectoryExists, validateTeamNameOrThrow, getTeamsBaseDir } from "../storage.js";
import { sanitizeTeammateName, buildTeammateSessionKey } from "../naming.js";

const TeammateSpawnSchema = Type.Object({
  team_name: Type.String({ minLength: 1, maxLength: 50 }),
  name: Type.String({ minLength: 1, maxLength: 100 }),
  agent_type: Type.Optional(Type.String()),
  model: Type.Optional(Type.String()),
});

interface ToolContext {
  api: OpenClawPluginApi;
  config: {
    maxTeammatesPerTeam: number;
    defaultAgentType: string;
  };
  teamsDir: string;
}

export function createTeammateSpawnTool(ctx: ToolContext): AnyAgentTool {
  return {
    label: "Teammate Spawn",
    name: "teammate_spawn",
    description: "Creates a new teammate agent and adds it to the team.",
    parameters: TeammateSpawnSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;

      const teamName = readStringParam(params, "team_name", { required: true });
      const name = readStringParam(params, "name", { required: true });
      const agentType = readStringParam(params, "agent_type");
      const model = readStringParam(params, "model");

      try {
        validateTeamNameOrThrow(teamName);

        if (!(await teamDirectoryExists(ctx.teamsDir, teamName))) {
          return jsonResult({
            error: `Team '${teamName}' not found. Create the team first.`,
          });
        }

        const manager = getTeamManager(teamName, ctx.teamsDir);
        const teamConfig = await manager.getTeamConfig();

        if (teamConfig.metadata?.status !== "active") {
          return jsonResult({
            error: `Team '${teamName}' is not active (status: ${teamConfig.metadata?.status}).`,
          });
        }

        // Check teammate limit
        const members = manager.listMembers();
        if (members.length >= ctx.config.maxTeammatesPerTeam) {
          return jsonResult({
            error: `Team '${teamName}' has reached maximum teammates (${ctx.config.maxTeammatesPerTeam}).`,
          });
        }

        const sanitizedName = sanitizeTeammateName(name);
        const sessionKey = buildTeammateSessionKey(sanitizedName);

        // Use subagent API to create the teammate session
        // This requires the enhanced plugin SDK
        const sessionResult = await ctx.api.subagent.createTeammateSession({
          teamName,
          teammateName: sanitizedName,
          agentType: agentType ?? ctx.config.defaultAgentType,
          model: model,
          initialContext: [
            `[Team Context] You are "${name}", a teammate in team "${teamName}".`,
            "",
            "Available team tools:",
            "- task_list: Find available tasks to work on",
            "- task_claim: Claim a task for yourself",
            "- task_complete: Mark a claimed task as complete",
            "- send_message: Send messages to teammates",
            "- inbox: Check for new messages",
            "",
            "Workflow:",
            "1. Call task_list to find pending tasks",
            "2. Call task_claim to claim a task",
            "3. Do the work required",
            "4. Call task_complete when done",
            "5. Use send_message to notify the team lead",
          ].join("\n"),
        });

        // Add member to team ledger
        await manager.addMember({
          name,
          sessionKey,
          agentId: sessionResult.agentId,
          agentType: agentType ?? "member",
          status: "idle",
        });

        return jsonResult({
          teammateId: sanitizedName,
          sessionKey,
          agentId: sessionResult.agentId,
          runId: sessionResult.runId,
          name,
          teamName,
          status: "spawned",
          message: `Teammate '${name}' spawned with session key: ${sessionKey}`,
        });
      } catch (err) {
        return jsonResult({
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}
```

## Skills

### skills/team-lead/SKILL.md

```markdown
# Team Lead Skill

You are the team lead for a multi-agent team. Your role is to coordinate teammates and manage tasks.

## Available Tools

- `team_create`: Create a new team
- `team_shutdown`: Shut down a team
- `teammate_spawn`: Create new teammate agents
- `task_create`: Add tasks to the team ledger
- `task_list`: View all tasks and their status
- `send_message`: Send messages to teammates
- `inbox`: Check for messages from teammates

## Workflow

1. **Planning**: Break down the user's request into tasks
2. **Delegation**: Spawn appropriate teammates for each task
3. **Coordination**: Monitor progress and handle blockers
4. **Completion**: Aggregate results and report to user

## Best Practices

- Create clear, actionable tasks with proper descriptions
- Assign tasks based on teammate capabilities
- Monitor the inbox regularly for teammate updates
- Handle task dependencies by ordering task creation appropriately
- Shut down the team when work is complete
```

## Implementation Roadmap

### Phase 1: Plugin SDK Enhancement

1. Add `SubagentApi` to plugin SDK
2. Add `TeamStorageApi` to plugin SDK
3. Add `MessageRoutingApi` to plugin SDK
4. Expose internal implementations via these APIs

### Phase 2: Plugin Migration

1. Create standalone package structure
2. Migrate types, manager, ledger, storage modules
3. Refactor tools to use new plugin APIs
4. Add comprehensive tests

### Phase 3: Testing & Documentation

1. Write integration tests with mock plugin SDK
2. Write README with setup instructions
3. Add example use cases
4. Document configuration options

## Benefits of Plugin Architecture

1. **Modularity**: Team functionality is optional and can be installed/removed
2. **Maintainability**: Clear boundaries between core and plugin code
3. **Extensibility**: Other plugins can build on top of team APIs
4. **Versioning**: Plugin can be versioned independently
5. **Testing**: Plugin can be tested in isolation