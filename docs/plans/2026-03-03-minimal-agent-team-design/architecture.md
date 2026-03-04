# Architecture

## Component Diagram

```mermaid
graph TB
    subgraph Plugin["openclaw-agent-team Plugin"]
        subgraph Tools["Tools Layer (3 tools)"]
            TC[team-create.ts]
            TS[team-shutdown.ts]
            TSp[teammate-spawn.ts]
        end

        subgraph Infrastructure["Infrastructure Layer"]
            Storage[storage.ts]
            Runtime[runtime.ts]
            Channel[channel.ts]
        end

        subgraph Foundation["Foundation Layer"]
            Types[types.ts]
        end
    end

    subgraph OpenClaw["OpenClaw Core"]
        Sessions[sessions_send<br/>sessions_history]
        Config[openclaw.json]
    end

    TC --> Storage
    TS --> Storage
    TS --> Runtime
    TSp --> Runtime
    TSp --> Storage

    Storage --> Types
    Runtime --> Config
    Channel --> Config
```

## File Structure

### Current (7 tools)

```
packages/openclaw-agent-team/src/
├── index.ts
├── types.ts
├── ledger.ts                     # REMOVE
├── storage.ts
├── runtime.ts
├── channel.ts
└── tools/
    ├── team-create.ts
    ├── team-shutdown.ts
    ├── teammate-spawn.ts
    ├── task-create.ts            # REMOVE
    ├── task-list.ts              # REMOVE
    ├── task-claim.ts             # REMOVE
    └── task-complete.ts          # REMOVE
```

### After Minimal Refactor (3 tools)

```
packages/openclaw-agent-team/src/
├── index.ts                      # Remove task tool imports
├── types.ts                      # Remove Task types
├── storage.ts                    # Keep (team directory management)
├── runtime.ts                    # Keep
├── channel.ts                    # Keep
└── tools/
    ├── team-create.ts            # Keep
    ├── team-shutdown.ts          # Keep
    └── teammate-spawn.ts         # Keep
```

## Sequence Diagrams

### Team Creation

```mermaid
sequenceDiagram
    participant User
    participant tool as team_create
    participant storage as Storage

    User->>tool: create(team_name, agent_type)
    tool->>storage: teamDirectoryExists()

    alt Team exists
        tool-->>User: error TEAM_ALREADY_EXISTS
    end

    tool->>storage: writeTeamConfig()
    Note over storage: Creates ~/.openclaw/teams/{team}/config.json

    tool-->>User: {teamId, teamName, status}
```

### Teammate Spawn

```mermaid
sequenceDiagram
    participant User
    participant tool as teammate_spawn
    participant storage as Storage
    participant cfg as OpenClawConfig

    User->>tool: spawn(team, name, type)
    tool->>storage: teamDirectoryExists()
    tool->>storage: readTeamConfig()

    alt Team not active
        tool-->>User: error TEAM_NOT_ACTIVE
    end

    tool->>storage: resolveTeammatePaths()
    tool->>tool: mkdir workspace & agentDir

    tool->>cfg: loadConfig()
    tool->>tool: Build agent + binding
    tool->>cfg: writeConfigFile(updated)

    Note over cfg: Agent registered in openclaw.json

    tool-->>User: {agentId, sessionKey}
```

### Team Shutdown

```mermaid
sequenceDiagram
    participant User
    participant tool as team_shutdown
    participant storage as Storage
    participant cfg as OpenClawConfig

    User->>tool: shutdown(team_name)
    tool->>storage: teamDirectoryExists()

    alt Team not found
        tool-->>User: error TEAM_NOT_FOUND
    end

    tool->>storage: readTeamConfig()
    tool->>cfg: loadConfig()

    Note over tool: Find all agents for this team

    tool->>tool: Filter out team agents & bindings
    tool->>cfg: writeConfigFile(updated)

    Note over cfg: Agents & bindings removed

    tool->>storage: deleteTeamDirectory()

    Note over storage: Deletes ~/.openclaw/teams/{team}/

    tool-->>User: {status: shutdown}
```

## Data Storage

### Team Directory Structure

```
~/.openclaw/teams/{team-name}/
├── config.json         # Team configuration
└── agents/
    └── {teammateName}/
        ├── workspace/  # Teammate workspace
        └── agent/      # Teammate agent config
```

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

### OpenClaw Config Integration

```json
{
  "agents": {
    "list": [
      {
        "id": "teammate-my-team-researcher",
        "workspace": "~/.openclaw/teams/my-team/agents/researcher/workspace",
        "agentDir": "~/.openclaw/teams/my-team/agents/researcher/agent"
      }
    ]
  },
  "bindings": [
    {
      "agentId": "teammate-my-team-researcher",
      "match": {
        "channel": "agent-team",
        "peer": {
          "kind": "direct",
          "id": "my-team:researcher"
        }
      }
    }
  ]
}
```

## Types (Simplified)

```typescript
// Team Configuration
export const TeamConfigSchema = Type.Object({
  id: Type.String(),
  team_name: Type.String(),
  description: Type.Optional(Type.String()),
  agent_type: Type.String(),
  lead: Type.Optional(Type.String()),
  metadata: Type.Object({
    createdAt: Type.Number(),
    updatedAt: Type.Number(),
    status: Type.String(),
  }),
});

// Teammate Definition
export const TeammateDefinitionSchema = Type.Object({
  name: Type.String(),
  agentId: Type.String(),
  sessionKey: Type.String(),
  agentType: Type.String(),
  model: Type.Optional(Type.String()),
  tools: Type.Optional(TeammateToolsSchema),
  status: TeammateStatusSchema,
  joinedAt: Type.Number(),
});

// Plugin Configuration
export const AgentTeamConfigSchema = Type.Object({
  maxTeammatesPerTeam: Type.Number({ default: 10 }),
  defaultAgentType: Type.String({ default: "general-purpose" }),
  teamsDir: Type.Optional(Type.String()),
});
```

## Removed Types

| Type | Reason |
|------|--------|
| `Task` | Task management removed |
| `TaskStatus` | Task management removed |
| `TeamMessage` | Messaging removed (use core) |
| `SendMessageParams` | Messaging removed (use core) |

## Tool Count Comparison

| Version | Tools | Purpose |
|---------|-------|---------|
| Original | 9 | Full coordination + messaging |
| After refactor | 7 | Task coordination only |
| **Minimal** | **3** | **Agent lifecycle only** |

## Communication Flow

Teammates communicate directly via OpenClaw core:

```mermaid
sequenceDiagram
    participant Lead as Team Lead
    participant Core as OpenClaw Core
    participant T1 as Teammate 1
    participant T2 as Teammate 2

    Lead->>Core: sessions_send(to: "team:t1", message)
    Core->>T1: Route via binding
    T1->>Core: sessions_send(to: "team:t2", message)
    Core->>T2: Route via binding
    T2->>Core: sessions_send(to: "team:lead", result)
    Core->>Lead: Route via binding
```

No plugin messaging layer needed - OpenClaw handles all routing.
