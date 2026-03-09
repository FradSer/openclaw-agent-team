# OpenClaw Agent Team

> Multi-agent team coordination plugin for OpenClaw with shared task ledger and inter-agent messaging.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/node-%3E%3D20.0.0-339933?style=flat&logo=nodedotjs)](https://nodejs.org)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Twitter Follow](https://img.shields.io/twitter/follow/FradSer?style=social)](https://twitter.com/FradSer)

[English](README.md) | [简体中文](README.zh-CN.md)

## Overview

`@fradser/openclaw-agent-team` is an OpenClaw plugin that enables sophisticated multi-agent coordination through:

- **Team Management** — Create and manage teams of AI agents working together
- **Task Ledger** — Shared JSONL-based task tracking with dependency management
- **Inter-Agent Messaging** — Direct communication between teammates via the `agent-team` channel
- **Dynamic Spawning** — Spawn new agent teammates on-demand with custom configurations
- **Workspace Isolation** — Each teammate gets dedicated workspace and agent directories

## Features

- **3 Agent Tools**: `team_create`, `team_shutdown`, `teammate_spawn`
- **JSONL Persistence**: Lightweight, append-only storage for tasks and members
- **Dependency Tracking**: Task dependencies with circular dependency detection
- **Channel Plugin**: Built-in `agent-team` messaging channel for teammate communication
- **Context Injection**: Automatic teammate context via `before_prompt_build` hook
- **Capacity Management**: Configurable team size limits (1-50 teammates)
- **Path Traversal Protection**: Secure file operations with validation
- **TypeBox Validation**: Runtime schema validation for all data structures

## Installation

### Prerequisites

- Node.js >= 20.0.0
- OpenClaw >= 2026.3.2
- pnpm (recommended)

### Install from npm

```bash
openclaw plugins install @fradser/openclaw-agent-team
```

### Install from source

```bash
git clone https://github.com/FradSer/openclaw-agent-team.git
cd openclaw-agent-team
pnpm install
pnpm build
```

### Configure OpenClaw

Add to your OpenClaw configuration:

```json
{
  "plugins": [
    {
      "id": "openclaw-agent-team",
      "config": {
        "maxTeammatesPerTeam": 10,
        "defaultAgentType": "general-purpose",
        "teamsDir": "~/.openclaw/teams"
      }
    }
  ],
  "tools": {
    "sessions": {
      "visibility": "all"
    },
    "agentToAgent": {
      "enabled": true,
      "allow": [
        "*"
      ]
    }
  }
}
```

> **Important**: The `tools.agentToAgent.enabled` configuration must be set to `true` to allow inter-agent messaging, and `tools.sessions.visibility` must be `"all"` for teammates to see each other.

## Usage Guide

You don't need to manually invoke the JSON tool calls. Once the plugin is installed and configured, you can simply ask the primary agent in plain language to start a team.

The primary agent will act as the "Team Leader", dynamically creating the team, spawning teammates, assigning tasks, and chatting with them.

**Example Prompts:**

- `"Create an agent team to research the latest AI models and write a report. I need one researcher and one writer."`
- `"Spawn a team to help me refactor this project. One agent should read the code and propose changes, another should write the tests."`
- `"Let's build a small web app. Create a frontend developer agent and a backend developer agent to work on it together in a team."`

## Quick Start (Under the Hood)

### 1. Create a Team

```typescript
// Agent uses the team_create tool
{
  "tool": "team_create",
  "input": {
    "team_name": "research-team",
    "description": "Team for research and analysis tasks",
    "agent_type": "researcher"
  }
}
```

### 2. Spawn Teammates

```typescript
// Spawn a teammate
{
  "tool": "teammate_spawn",
  "input": {
    "team_name": "research-team",
    "name": "analyst-1",
    "agent_type": "data-analyst",
    "model": "claude-opus-4-6"
  }
}
```

### 3. Send Messages

```typescript
// Use the agent-team channel
{
  "channel": "agent-team",
  "target": "research-team:analyst-1",
  "message": "Please analyze the latest dataset"
}
```

### 4. Shutdown Team

```typescript
// Gracefully shutdown and cleanup
{
  "tool": "team_shutdown",
  "input": {
    "team_name": "research-team",
    "reason": "Project completed"
  }
}
```

## How It Works

The `@fradser/openclaw-agent-team` plugin deeply integrates with OpenClaw's runtime to enable multi-agent coordination:

1. **Team Creation (`team_create`)**: When an agent uses the `team_create` tool, the plugin creates a dedicated team directory under `~/.openclaw/teams/` and initializes a `config.json` and a JSONL-based member ledger.
2. **Dynamic Teammate Spawning (`teammate_spawn`)**: When the `teammate_spawn` tool is called, the plugin validates the request and creates a new OpenClaw session (sub-agent). Crucially, it **binds** this new agent to the OpenClaw runtime (`runtime.agents.set(...)`), dynamically injecting its session key, tools, and configurations so the new teammate runs immediately within the same OpenClaw daemon.
3. **Context Injection**: Through the `before_prompt_build` hook, the plugin automatically injects team awareness into every teammate's prompt. This allows agents to intuitively know their role, the current active team members, and how to communicate with others.
4. **Inter-Agent Messaging**: The built-in `agent-team` channel plugin allows agents to address each other using the format `teamName:teammateName`. Messages are appended to individual `messages.jsonl` files in the team's inbox, and OpenClaw routes them securely to the target agent session.

## Architecture

The plugin follows a 4-layer architecture with strict inward dependencies:

```mermaid
graph TB
    subgraph Tools["Tools Layer"]
        TeamCreate[team-create.ts]
        TeamShutdown[team-shutdown.ts]
        TeammateSpawn[teammate-spawn.ts]
    end

    subgraph Core["Core Layer"]
        Index[index.ts]
        Ledger[ledger.ts]
        Channel[channel.ts]
        Runtime[runtime.ts]
        ContextInjection[context-injection.ts]
        DynamicTeammate[dynamic-teammate.ts]
    end

    subgraph StorageLayer["Storage Layer"]
        Storage[storage.ts]
    end

    subgraph Foundation["Foundation Layer"]
        Types[types.ts]
    end

    Tools --> Core
    Core --> StorageLayer
    StorageLayer --> Foundation
```

### Layer Responsibilities

- **Foundation**: TypeBox schemas, validation, constants
- **Storage**: File system operations, directory management, config I/O
- **Core**: Business logic, ledger operations, messaging, runtime management
- **Tools**: Agent-facing tool implementations

## API Reference

### team_create

Create a new team with a unique name.

**Input Schema:**

```typescript
{
  team_name: string;      // 1-50 chars, lowercase alphanumeric and hyphens
  description?: string;   // Optional team description
  agent_type?: string;    // Optional default agent type
}
```

**Returns:**

```typescript
{
  teamId: string;         // Generated UUID
  teamName: string;       // Normalized team name
  status: "active";       // Team status
}
```

**Error Codes:**
- `DUPLICATE_TEAM_NAME` — Team already exists
- `INVALID_TEAM_NAME` — Name fails validation
- `TEAM_NAME_TOO_LONG` — Name exceeds 50 characters
- `EMPTY_TEAM_NAME` — Name is empty

### teammate_spawn

Spawn a new agent teammate in an existing team.

**Input Schema:**

```typescript
{
  team_name: string;      // Existing team name
  name: string;           // Teammate name (auto-sanitized)
  agent_type?: string;    // Optional agent type override
  model?: string;         // Optional model override
  tools?: {               // Optional tool restrictions
    allow?: string[];     // Whitelist of allowed tools
    deny?: string[];      // Blacklist of denied tools
  };
}
```

**Returns:**

```typescript
{
  agentId: string;        // Format: "teammate:{teamName}:{name}"
  sessionKey: string;     // Format: "agent:{agentId}:main"
  status: "idle";         // Initial status
}
```

**Error Codes:**
- `TEAM_NOT_FOUND` — Team doesn't exist
- `TEAM_NOT_ACTIVE` — Team is shutdown
- `TEAM_AT_CAPACITY` — Max teammates reached
- `DUPLICATE_TEAMMATE_NAME` — Name already in use
- `INVALID_TEAMMATE_NAME` — Name fails validation

### team_shutdown

Gracefully shutdown a team and delete all data.

**Input Schema:**

```typescript
{
  team_name: string;      // Team to shutdown
  reason?: string;        // Optional shutdown reason
}
```

**Returns:**

```typescript
{
  teamName: string;       // Shutdown team name
  status: "shutdown";     // Final status
  teammatesShutdown: number;  // Count of teammates shutdown
}
```

**Error Codes:**
- `TEAM_NOT_FOUND` — Team doesn't exist
- `TEAM_ALREADY_SHUTDOWN` — Team already shutdown

## Configuration

Configure the plugin via OpenClaw's plugin configuration:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxTeammatesPerTeam` | number | 10 | Maximum teammates per team (1-50) |
| `defaultAgentType` | string | "general-purpose" | Default agent type for teammates |
| `teamsDir` | string | "~/.openclaw/teams" | Directory for team data storage |

**Example:**

```json
{
  "plugins": [
    {
      "id": "openclaw-agent-team",
      "config": {
        "maxTeammatesPerTeam": 20,
        "defaultAgentType": "specialist",
        "teamsDir": "/custom/path/teams"
      }
    }
  ]
}
```

## Data Storage

Teams are stored in `~/.openclaw/teams/{team-name}/` (or custom `teamsDir`):

```
{team-name}/
├── config.json                        # TeamConfig JSON
├── tasks.jsonl                        # Task records (one JSON per line)
├── members.jsonl                      # Teammate member records
├── dependencies.jsonl                 # Task dependency edges
├── agents/
│   └── {teammateName}/               # Teammate workspace directory
│       ├── workspace/                 # Agent working directory
│       └── agent/                     # Agent directory
└── inbox/
    └── {teammateName}/
        └── messages.jsonl             # Inbound messages for teammate
```

### JSONL Format

All ledger files use JSONL (JSON Lines) format for efficient append-only operations:

```jsonl
{"id":"task-1","subject":"Research","status":"pending","createdAt":"2026-03-05T10:00:00Z"}
{"id":"task-2","subject":"Analysis","status":"in_progress","owner":"analyst-1","createdAt":"2026-03-05T10:05:00Z"}
```

## Development

### Setup

```bash
# Clone repository
git clone https://github.com/FradSer/openclaw-agent-team.git
cd openclaw-agent-team

# Install dependencies
pnpm install

# Build
pnpm build
```

### Testing

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run specific test file
cd packages/openclaw-agent-team
pnpm vitest run tests/ledger.test.ts
```

### Linting

```bash
pnpm lint
```

### Project Structure

```
openclaw-agent-team/
├── package.json                  # Monorepo root
├── pnpm-workspace.yaml           # Workspace config
├── CLAUDE.md                     # Development documentation
├── README.md                     # This file
└── packages/
    └── openclaw-agent-team/      # Main plugin package
        ├── package.json
        ├── tsconfig.json
        ├── vitest.config.ts
        ├── openclaw.plugin.json  # Plugin manifest
        ├── index.ts              # Re-exports
        ├── src/                  # Source files
        │   ├── index.ts          # Plugin entry point
        │   ├── types.ts          # TypeBox schemas
        │   ├── storage.ts        # File operations
        │   ├── ledger.ts         # Task/member persistence
        │   ├── channel.ts        # Messaging channel
        │   ├── runtime.ts        # Runtime singleton
        │   ├── context-injection.ts  # Context hook
        │   ├── dynamic-teammate.ts   # Spawning logic
        │   └── tools/            # Tool implementations
        └── tests/                # Test files
```

## Contributing

Contributions are welcome! Please follow these guidelines:

### Commit Format

```
<type>(<scope>): <description>
```

**Types**: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `style`

**Scopes**: `plugin`, `team`, `task`, `agent`, `msg`, `coord`, `config`, `deps`, `ci`, `docs`

### Branch Naming

- `feature/*` — New features
- `fix/*` — Bug fixes
- `hotfix/*` — Critical fixes
- `refactor/*` — Code refactoring
- `docs/*` — Documentation updates

### Testing Requirements

- All new features must include tests
- Maintain test coverage above 80%
- Follow BDD principles with Given/When/Then scenarios

## License

MIT License

Copyright (c) 2026 Frad LEE

## Author

**Frad LEE**
- Email: fradser@gmail.com
- GitHub: [@FradSer](https://github.com/FradSer)

## Links

- [Repository](https://github.com/FradSer/openclaw-agent-team)
- [Issues](https://github.com/FradSer/openclaw-agent-team/issues)
- [OpenClaw Documentation](https://openclaw.dev)
