# OpenClaw Agent Team

> Multi-agent team coordination plugin for OpenClaw with shared task ledger and inter-agent messaging

[中文文档](README.zh-CN.md) | English

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/FradSer/openclaw-agent-team)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org)

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
- OpenClaw >= 1.0.0
- pnpm (recommended)

### Install from npm

```bash
pnpm add @fradser/openclaw-agent-team
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
  ]
}
```

## Quick Start

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

    subgraph Storage["Storage Layer"]
        Storage[storage.ts]
    end

    subgraph Foundation["Foundation Layer"]
        Types[types.ts]
    end

    Tools --> Core
    Core --> Storage
    Storage --> Foundation
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

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Author

**Frad LEE**
- Email: fradser@gmail.com
- GitHub: [@FradSer](https://github.com/FradSer)

## Links

- [Repository](https://github.com/FradSer/openclaw-agent-team)
- [Issues](https://github.com/FradSer/openclaw-agent-team/issues)
- [OpenClaw Documentation](https://openclaw.dev)
