# Architecture

## Component Diagram

### Current State

```mermaid
graph TB
    subgraph Tools["Tools Layer (current)"]
        TC[team-create.ts]
        TS[team-shutdown.ts]
        TSp[teammate-spawn.ts]
    end

    subgraph Core["Core Layer (current)"]
        DT[dynamic-teammate.ts<br/>Agent Lifecycle]
        Ledger[ledger.ts<br/>Member Store]
        CI[context-injection.ts<br/>pending deletion]
        Channel[channel.ts]
    end

    subgraph Infrastructure["Infrastructure Layer"]
        Storage[storage.ts]
        Runtime[runtime.ts]
    end

    subgraph Foundation["Foundation Layer"]
        Types[types.ts]
    end

    TC --> Storage
    TS --> DT
    TS --> Storage
    TSp --> DT
    TSp --> Ledger

    DT --> Runtime
    Ledger --> Storage
    Storage --> Types

    style CI fill:#f99
    style DT fill:#9f9
```

### Target State

```mermaid
graph TB
    subgraph Tools["Tools Layer"]
        TC[team-create.ts<br/>Config Only]
        TS[team-shutdown.ts<br/>Cleanup + Config]
        TSp[teammate-spawn.ts<br/>Agent + Binding]
        TR[teammate-remove.ts<br/>Remove Agent]
        TaskC[task-create.ts]
        TaskL[task-list.ts]
        TaskCl[task-claim.ts]
        TaskCo[task-complete.ts]
    end

    subgraph Core["Core Layer"]
        Ledger[ledger.ts<br/>Task/Member Store]
        AgentMgr[agent-manager.ts<br/>Dynamic Agent Lifecycle]
    end

    subgraph Infrastructure["Infrastructure Layer"]
        Storage[storage.ts]
        Runtime[runtime.ts]
        Channel[channel.ts]
    end

    subgraph Foundation["Foundation Layer"]
        Types[types.ts]
    end

    TC --> Storage
    TS --> AgentMgr
    TS --> Storage
    TSp --> AgentMgr
    TSp --> Ledger
    TR --> AgentMgr
    TR --> Ledger
    TaskC --> Ledger
    TaskL --> Ledger
    TaskCl --> Ledger
    TaskCo --> Ledger

    AgentMgr --> Runtime
    Ledger --> Storage
    Storage --> Types

    style AgentMgr fill:#9f9
```

## File Structure

### Current State (2026-03-14)

```
packages/openclaw-agent-team/src/
├── index.ts                    # Plugin entry point
├── types.ts                    # TypeBox schemas
├── ledger.ts                   # Member persistence (JSONL)
├── storage.ts                  # Path resolution, directory ops
├── runtime.ts                  # PluginRuntime singleton
├── channel.ts                  # agent-team channel plugin
├── dynamic-teammate.ts         # Agent lifecycle (maybeSpawnTeammate, repairTeammateBinding)
├── context-injection.ts        # before_prompt_build hook (pending deletion)
└── tools/
    ├── team-create.ts
    ├── team-shutdown.ts
    └── teammate-spawn.ts
```

`dynamic-teammate.ts` already uses `runtime.config.loadConfig()` and `runtime.config.writeConfigFile()` — both are confirmed official public API from `PluginRuntimeCore` in `openclaw/plugin-sdk`.

### Target State

```
packages/openclaw-agent-team/src/
├── index.ts                    # Plugin entry point
├── types.ts                    # TypeBox schemas
│
├── core/
│   ├── ledger.ts              # Task/Member persistence
│   └── agent-manager.ts       # Dynamic agent lifecycle
│
├── channel/
│   └── agent-team-channel.ts  # Channel plugin
│
├── tools/
│   ├── team-create.ts         # Config only
│   ├── team-shutdown.ts       # Cleanup
│   ├── teammate-spawn.ts      # Create agent + binding
│   ├── teammate-remove.ts     # Remove agent + binding
│   ├── task-create.ts
│   ├── task-list.ts
│   ├── task-claim.ts
│   └── task-complete.ts
│
├── storage.ts                 # Path resolution
└── runtime.ts                 # PluginRuntime accessor
```

## Key Interfaces

### AgentManager

`dynamic-teammate.ts` currently implements the agent lifecycle directly. The refactor extracts this into a formal `AgentManager` interface:

```typescript
// core/agent-manager.ts
import type { PluginRuntime } from "openclaw/plugin-sdk";

// runtime.config.loadConfig() and runtime.config.writeConfigFile() are
// official public API defined in PluginRuntimeCore from openclaw/plugin-sdk.

export interface DynamicAgentConfig {
  agentId: string;
  teamName: string;
  teammateName: string;
  agentType: string;
  workspace: string;
  agentDir: string;
  model?: string;
  tools?: { allow?: string[]; deny?: string[] };
}

export interface AgentManager {
  /**
   * Creates a dynamic agent with workspace, agentDir, and binding.
   * Uses runtime.config.writeConfigFile for atomic updates.
   */
  createAgent(config: DynamicAgentConfig): Promise<{
    agentId: string;
    sessionKey: string;
  }>;

  /**
   * Removes an agent and its binding from the config.
   */
  removeAgent(agentId: string): Promise<void>;

  /**
   * Lists all agents belonging to a team.
   */
  listTeamAgents(teamName: string): Promise<DynamicAgentConfig[]>;
}

export function createAgentManager(runtime: PluginRuntime): AgentManager;
```

### AgentManager Implementation

```typescript
// core/agent-manager.ts
import type { OpenClawConfig } from "openclaw/plugin-sdk";

const AGENT_ID_TEMPLATE = "teammate-{teamName}-{teammateName}";
const WORKSPACE_TEMPLATE = "~/.openclaw/teams/{teamName}/agents/{teammateName}/workspace";
const AGENT_DIR_TEMPLATE = "~/.openclaw/teams/{teamName}/agents/{teammateName}/agent";
const CHANNEL = "agent-team";

export function createAgentManager(runtime: PluginRuntime): AgentManager {
  return {
    async createAgent(config) {
      const cfg = await runtime.config.loadConfig();

      // Check if agent already exists
      const existingAgent = cfg.agents?.list?.find((a) => a.id === config.agentId);
      if (existingAgent) {
        // Agent exists - ensure binding exists
        const hasBinding = cfg.bindings?.some(
          (b) => b.agentId === config.agentId && b.match?.channel === CHANNEL
        );
        if (!hasBinding) {
          await this._addBinding(cfg, config);
        }
        return {
          agentId: config.agentId,
          sessionKey: `agent:${config.agentId}:main`,
        };
      }

      // Create new agent + binding
      const updatedCfg = this._buildUpdatedConfig(cfg, config);
      await runtime.config.writeConfigFile(updatedCfg);

      return {
        agentId: config.agentId,
        sessionKey: `agent:${config.agentId}:main`,
      };
    },

    async removeAgent(agentId: string) {
      const cfg = await runtime.config.loadConfig();

      const updatedCfg = {
        ...cfg,
        agents: {
          ...cfg.agents,
          list: (cfg.agents?.list ?? []).filter((a) => a.id !== agentId),
        },
        bindings: (cfg.bindings ?? []).filter((b) => b.agentId !== agentId),
      };

      await runtime.config.writeConfigFile(updatedCfg);
    },

    async listTeamAgents(teamName: string) {
      const cfg = await runtime.config.loadConfig();
      const prefix = `teammate-${teamName}-`;

      return (cfg.agents?.list ?? [])
        .filter((a) => a.id.startsWith(prefix))
        .map((a) => this._parseAgentConfig(a));
    },

    _buildUpdatedConfig(cfg: OpenClawConfig, config: DynamicAgentConfig) {
      return {
        ...cfg,
        agents: {
          ...cfg.agents,
          list: [
            ...(cfg.agents?.list ?? []),
            {
              id: config.agentId,
              workspace: config.workspace,
              agentDir: config.agentDir,
              ...(config.model && { model: { primary: config.model } }),
              ...(config.tools && { tools: config.tools }),
            },
          ],
        },
        bindings: [
          ...(cfg.bindings ?? []),
          {
            agentId: config.agentId,
            match: {
              channel: CHANNEL,
              peer: {
                kind: "direct",
                id: `${config.teamName}:${config.teammateName}`,
              },
            },
          },
        ],
      };
    },

    _addBinding(cfg: OpenClawConfig, config: DynamicAgentConfig) {
      const updatedCfg = {
        ...cfg,
        bindings: [
          ...(cfg.bindings ?? []),
          {
            agentId: config.agentId,
            match: {
              channel: CHANNEL,
              peer: {
                kind: "direct",
                id: `${config.teamName}:${config.teammateName}`,
              },
            },
          },
        ],
      };
      return runtime.config.writeConfigFile(updatedCfg);
    },

    _parseAgentConfig(agent: { id: string; workspace?: string; agentDir?: string }) {
      // Parse agentId: teammate-{teamName}-{teammateName}
      const match = agent.id.match(/^teammate-(.+)-(.+)$/);
      return {
        agentId: agent.id,
        teamName: match?.[1] ?? "",
        teammateName: match?.[2] ?? "",
        workspace: agent.workspace ?? "",
        agentDir: agent.agentDir ?? "",
      };
    },
  };
}
```

## Data Storage

### Team Directory Structure

```
~/.openclaw/teams/{team-name}/
├── config.json         # Team configuration
├── members.jsonl       # Team member records (ledger)
└── agents/
    └── {teammateName}/
        ├── workspace/  # Teammate workspace
        └── agent/      # Teammate agent config
```

Note: `tasks.jsonl` and `dependencies.jsonl` are part of the target design (task tools not yet created). The `inbox/` directory is used by `channel.ts` for inter-agent messaging.

### Config.json Schema

```json
{
  "id": "uuid",
  "team_name": "my-team",
  "description": "Optional description",
  "agent_type": "team-lead",
  "lead": "coordinator",
  "metadata": {
    "createdAt": 1234567890,
    "updatedAt": 1234567890,
    "status": "active"
  }
}
```

## Sequence Diagrams

### Teammate Spawn

```mermaid
sequenceDiagram
    participant User
    participant tool as teammate_spawn
    participant am as AgentManager
    participant ledger as Ledger
    participant cfg as OpenClawConfig

    User->>tool: spawn(team, name, type)
    tool->>ledger: listMembers()
    tool->>tool: validateLimit()
    tool->>tool: buildAgentConfig()
    tool->>am: createAgent(config)
    am->>cfg: loadConfig()
    am->>am: buildAgent+Binding()
    am->>cfg: writeConfigFile()
    am-->>tool: {agentId, sessionKey}
    tool->>ledger: addMember()
    tool-->>User: result
```

### Team Shutdown

```mermaid
sequenceDiagram
    participant User
    participant tool as team_shutdown
    participant am as AgentManager
    participant ledger as Ledger
    participant storage as Storage

    User->>tool: shutdown(team)
    tool->>storage: readConfig()
    tool->>ledger: listMembers()
    loop For each member
        tool->>am: removeAgent(agentId)
        am->>cfg: writeConfigFile()
    end
    tool->>ledger: updateAllStatus("shutdown")
    tool->>storage: deleteTeamDirectory()
    tool-->>User: result
```
