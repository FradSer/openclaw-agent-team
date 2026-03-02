# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a pnpm monorepo for `@fradser/openclaw-agent-team`, an OpenClaw plugin enabling multi-agent team coordination with a shared task ledger and inter-agent messaging.

## Commands

```bash
# Install dependencies
pnpm install

# Build (runs tsc and copies plugin manifest)
pnpm build

# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run a single test file
pnpm vitest run tests/ledger.test.ts

# Lint
pnpm lint
```

## Architecture

The plugin follows a 4-layer architecture with dependencies pointing inward:

```mermaid
graph TB
    subgraph Tools["Tools Layer"]
        TeamCreate[team-create.ts]
        TaskCreate[task-create.ts]
        SendMessage[send-message.ts]
    end

    subgraph Core["Core Layer"]
        Ledger[ledger.ts]
        Mailbox[mailbox.ts]
        Runtime[runtime.ts]
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

### Key Modules

- **`src/index.ts`** - Plugin entry point; registers 9 agent tools and the `before_prompt_build` hook
- **`src/types.ts`** - TypeBox schema definitions for `TeamConfig`, `Task`, `TeamMessage`, etc.
- **`src/ledger.ts`** - JSONL-based task/member/dependency persistence with in-memory caches
- **`src/mailbox.ts`** - Inter-agent messaging via per-recipient JSONL inbox files
- **`src/storage.ts`** - Team directory management under `~/.openclaw/teams/`
- **`src/runtime.ts`** - PluginRuntime singleton access
- **`src/context-injection.ts`** - Hook that injects pending messages into agent context

### Data Storage

Teams are stored in `~/.openclaw/teams/{team-name}/`:

```
{team-name}/
├── config.json         # Team configuration
├── tasks.jsonl         # Task records (one JSON object per line)
├── members.jsonl       # Team member records
├── dependencies.jsonl  # Task dependency records
├── inbox/
│   └── {sessionKey}/messages.jsonl
└── agents/{teammateName}/
```

### Agent Tools

The plugin registers 9 tools with OpenClaw:

| Tool | Purpose |
|------|---------|
| `team_create` | Create a new team with config |
| `team_shutdown` | Gracefully shutdown team |
| `teammate_spawn` | Spawn a new agent teammate |
| `task_create` | Create task with optional dependencies |
| `task_list` | List tasks with filters |
| `task_claim` | Claim an available task |
| `task_complete` | Mark task as completed |
| `send_message` | Direct message or broadcast |
| `inbox` | Read pending messages |

## Conventions

### Commit Scopes

`plugin`, `team`, `task`, `agent`, `msg`, `coord`, `config`, `deps`, `ci`, `docs`

### Commit Types

`feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `style`

### Branch Prefixes

`feature/*`, `fix/*`, `hotfix/*`, `refactor/*`, `docs/*`

## Testing

- Tests use Vitest with Node environment
- Test files are in `tests/**/*.test.ts`
- Tests run sequentially (`fileParallelism: false`) to avoid temp directory conflicts
- Follow BDD Given/When/Then scenarios stored in `.feature` files

## Plugin Development

This plugin targets `openclaw >=1.0.0` as a peer dependency. The plugin manifest (`openclaw.plugin.json`) defines the config schema including `maxTeammatesPerTeam`, `defaultAgentType`, and `teamsDir`.

For OpenClaw plugin API details, see `docs/plugin.md`.
