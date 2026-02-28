# Agent Team Plugin Design

## Context

The Agent Team plugin (`@fradser/openclaw-agent-team`) enables multi-agent coordination in OpenClaw by creating full isolated agent instances per teammate. This follows the Feishu dynamic agent pattern where each teammate is a complete agent process with its own workspace, tools, and communication channels.

### Problem Statement

Users need to coordinate multiple AI agents working together on complex tasks. Current OpenClaw provides `sessions_spawn` for sub-agents, but these are ephemeral and tightly coupled to the parent session. There is no persistent, peer-to-peer agent coordination mechanism.

### Solution Overview

A plugin that provides:
1. **Team Management**: Create/shutdown teams with isolated storage
2. **Teammate Spawning**: Create full agents (not sub-agents) with isolated workspaces
3. **Task Ledger**: SQLite-based task tracking with dependencies
4. **Mailbox Communication**: JSONL-based inter-agent messaging

## Requirements

### Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-001 | Create team with unique identifier and isolated directory | P0 |
| FR-002 | Spawn teammates as full agents with isolated workspaces | P0 |
| FR-003 | Teammates defined by team lead with name, role, model, tools | P0 |
| FR-004 | SQLite-based task ledger with status tracking | P0 |
| FR-005 | Task dependencies and blocking | P1 |
| FR-006 | JSONL mailbox for inter-agent messaging | P0 |
| FR-007 | Broadcast messages to all teammates | P1 |
| FR-008 | Team shutdown with graceful termination | P0 |

### Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-001 | Teammate spawn latency | < 5 seconds |
| NFR-002 | Message delivery reliability | 100% |
| NFR-003 | Concurrent teammates per team | 10 (configurable) |
| NFR-004 | Plugin load time | < 500ms |
| NFR-005 | SQLite query (1000 tasks) | < 50ms |

## Rationale

### Why Full Agents Instead of Sub-agents?

| Aspect | Full Agents | Sub-agents |
|--------|-------------|------------|
| Isolation | Complete workspace isolation | Shared with parent |
| Persistence | Survives parent restart | Tied to parent session |
| Independence | Can run autonomously | Requires parent context |
| Tools | Full tool configuration | Inherited/restricted from parent |

**Decision**: Full agents provide better isolation and autonomy for teammates, matching the Feishu dynamic agent pattern.

### Why JSONL Mailbox Instead of sessions_send?

| Aspect | JSONL Mailbox | sessions_send |
|--------|---------------|---------------|
| Persistence | Messages persist until read | Requires active session |
| Offline support | Teammates can read when ready | Recipient must be active |
| Audit trail | Built-in message log | No persistence |
| Implementation | Simple file I/O | Requires Gateway coordination |

**Decision**: JSONL mailbox provides persistence and simplicity for team coordination.

### Why SQLite Instead of In-Memory?

- **Persistence**: Tasks survive restarts
- **Querying**: Complex queries (dependencies, filtering)
- **Concurrency**: WAL mode supports concurrent reads/writes
- **Proven**: Already used in OpenClaw core

## Detailed Design

### Package Structure

```
@fradser/openclaw-agent-team/
├── index.ts                    # Plugin entry point
├── openclaw.plugin.json        # Plugin manifest
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── types.ts                # Team, Task, Teammate types
│   ├── storage.ts              # Directory/config management
│   ├── ledger.ts               # SQLite task persistence
│   ├── mailbox.ts              # JSONL message routing
│   ├── teammate-spawner.ts     # Dynamic agent creation
│   ├── context-injection.ts    # Team state injection
│   └── tools/
│       ├── register.ts         # Tool registration
│       ├── team-create.ts
│       ├── team-shutdown.ts
│       ├── teammate-spawn.ts
│       ├── task-create.ts
│       ├── task-list.ts
│       ├── task-claim.ts
│       ├── task-complete.ts
│       ├── send-message.ts
│       └── inbox.ts
├── skills/
│   └── team-lead/
│       └── SKILL.md
└── README.md
```

### Directory Structure

```
~/.openclaw/teams/
└── {team_name}/
    ├── config.json              # Team configuration
    ├── ledger.db                # SQLite database
    ├── inbox/                   # Per-session message directories
    │   └── {session_key}/
    │       └── messages.jsonl
    └── agents/                  # Teammate agent directories
        └── {teammate_name}/
            ├── agent/           # agentDir
            └── workspace/       # Isolated workspace
```

### Agent Configuration

Teammates are added to `agents.list` via `runtime.config.writeConfigFile()`:

```typescript
const agentId = `teammate-${teamName}-${sanitizeName(teammateName)}`;
const agentConfig = {
  id: agentId,
  workspace: `${teamsDir}/${teamName}/agents/${teammateName}/workspace`,
  agentDir: `${teamsDir}/${teamName}/agents/${teammateName}/agent`,
  model: modelOverride ? { primary: modelOverride } : undefined,
  tools: { allow: allowedTools, deny: deniedTools },
};
```

### JSONL Message Format

```typescript
interface TeamMessage {
  id: string;
  from: string;              // Sender session key
  to?: string;               // Recipient (undefined for broadcast)
  type: "message" | "broadcast" | "task_update" | "shutdown_request";
  content: string;
  summary?: string;          // 5-10 word summary
  timestamp: number;
}
```

### Tool Summary

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `team_create` | Create a new team | team_name, description |
| `team_shutdown` | Shutdown team and teammates | team_name |
| `teammate_spawn` | Spawn a teammate agent | team_name, name, agent_type, model |
| `task_create` | Add task to ledger | team_name, subject, description, blockedBy |
| `task_list` | List tasks | team_name, status, owner |
| `task_claim` | Claim a task | task_id |
| `task_complete` | Complete a task | task_id, result |
| `send_message` | Send message to teammate | recipient, content |
| `inbox` | Read pending messages | limit |

## Design Documents

- [BDD Specifications](./bdd-specs.md) - Behavior scenarios and testing strategy
- [Architecture](./architecture.md) - System architecture and component details
- [Best Practices](./best-practices.md) - Security, performance, and code quality guidelines

## Implementation Phases

1. **Phase 1**: Core infrastructure (types, storage, ledger)
2. **Phase 2**: Team management tools
3. **Phase 3**: Task system
4. **Phase 4**: Communication (mailbox)
5. **Phase 5**: Integration and testing