# openclaw-agent-team Minimal Plugin Design

## Context

The `openclaw-agent-team` plugin should focus on its core value: creating and managing independent agents (teammates) that communicate via OpenClaw's built-in multi-agent routing.

## Design Philosophy

**Follow OpenClaw's multi-agent pattern**: The plugin should only provide what OpenClaw core does not:
- Team lifecycle management (create/shutdown)
- Teammate spawning (creating agent + binding)

Everything else (messaging, session history, coordination) should use OpenClaw's built-in capabilities.

## What the Plugin Does NOT Need

| Feature | Reason | Alternative |
|---------|--------|-------------|
| Task management | No structured coordination needed | Agents use sessions for context |
| Messaging tools | Duplicates core | Use `sessions_send` |
| Mailbox/Inbox | Duplicates core | Use `sessions_history` |
| Task ledger | No task tracking needed | Session history provides context |

## Core Concepts

### 1. Team = Agent Container

A team is simply a container for grouping agents:
- Creates a namespace for teammate names
- Tracks team configuration
- Provides cleanup mechanism (shutdown)

### 2. Teammate = Independent Agent

Each teammate is a fully independent OpenClaw agent:
- Has its own workspace
- Has its own agent directory
- Has its own sessions
- Communicates via OpenClaw's A2A messaging

### 3. Communication via OpenClaw Core

Teammates communicate using OpenClaw's built-in capabilities:
- `sessions_send` for point-to-point messaging
- `sessions_history` for viewing conversation history
- `sessions_spawn` for creating child sessions

## Requirements

### Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| R1 | `team_create` creates team config | Must |
| R2 | `team_shutdown` removes agents/bindings AND deletes directory | Must |
| R3 | `teammate_spawn` creates agent + binding in openclaw.json | Must |
| R4 | Keep minimal `agent-team` channel plugin for routing | Must |

### Non-Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| NF1 | Config updates must be atomic | Must |
| NF2 | Cleanup must be complete | Must |
| NF3 | Minimal code footprint | Should |

## Tool Summary

| Tool | Purpose |
|------|---------|
| `team_create` | Create team container |
| `team_shutdown` | Delete team and all teammates |
| `teammate_spawn` | Spawn a new teammate agent |

**Total: 3 tools** (down from 9 original, 7 after first refactor)

## Architecture

```
packages/openclaw-agent-team/src/
├── index.ts                    # Plugin entry point
├── types.ts                    # Team/Teammate types only
├── storage.ts                  # Team directory management
├── runtime.ts                  # PluginRuntime accessor
├── channel.ts                  # agent-team channel plugin
└── tools/
    ├── team-create.ts          # Create team config
    ├── team-shutdown.ts        # Delete team + cleanup
    └── teammate-spawn.ts       # Create agent + binding
```

## What to Remove

| File | Lines | Reason |
|------|-------|--------|
| `ledger.ts` | ~300 | Task/member persistence removed |
| `tools/task-create.ts` | ~150 | Task tool removed |
| `tools/task-list.ts` | ~120 | Task tool removed |
| `tools/task-claim.ts` | ~130 | Task tool removed |
| `tools/task-complete.ts` | ~110 | Task tool removed |
| `tests/ledger.test.ts` | ~400 | Ledger tests removed |
| `tests/tools/task-*.test.ts` | ~600 | Task tool tests removed |

**Estimated removal: ~1800+ lines**

## Data Storage (Simplified)

### Team Directory Structure

```
~/.openclaw/teams/{team-name}/
├── config.json         # Team configuration only
└── agents/
    └── {teammateName}/
        ├── workspace/  # Teammate workspace
        └── agent/      # Teammate agent config
```

No ledger.db, no tasks.jsonl, no members.jsonl, no dependencies.jsonl.

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

## Usage Pattern

### 1. Create Team

```
User: Create a team for researching AI safety
Agent: team_create({ team_name: "ai-safety-research", agent_type: "team-lead" })
```

### 2. Spawn Teammates

```
Agent: teammate_spawn({ team_name: "ai-safety-research", name: "researcher", agent_type: "Explore" })
Agent: teammate_spawn({ team_name: "ai-safety-research", name: "writer", agent_type: "general-purpose" })
```

### 3. Coordinate via OpenClaw Core

```
Agent: sessions_send({ to: "ai-safety-research:researcher", message: "Research current AI safety approaches" })
Researcher: (does research, responds via A2A)
Agent: sessions_send({ to: "ai-safety-research:writer", message: "Compile the findings" })
```

### 4. Shutdown Team

```
Agent: team_shutdown({ team_name: "ai-safety-research" })
```

## Comparison with OpenClaw Multi-Agent

| Aspect | OpenClaw Core | This Plugin |
|--------|---------------|-------------|
| Agent creation | Manual config edit | `teammate_spawn` tool |
| Agent grouping | No concept | Team container |
| Agent cleanup | Manual | `team_shutdown` |
| Messaging | `sessions_send` | Uses core |
| History | `sessions_history` | Uses core |

The plugin adds convenience tools for managing groups of agents without duplicating messaging functionality.

## Design Documents

- [Architecture](./architecture.md) - System architecture and component details
- [Migration Plan](./migration-plan.md) - Steps to remove task functionality
