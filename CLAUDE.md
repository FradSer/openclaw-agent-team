# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a pnpm monorepo for `@fradser/openclaw-agent-team`, an OpenClaw plugin enabling multi-agent team coordination with inter-agent messaging.

**Package**: `@fradser/openclaw-agent-team` v1.0.0
**Author**: Frad LEE <fradser@gmail.com>
**License**: MIT
**Peer dependency**: `openclaw >=2026.3.2`

## Commands

Run all commands from the repository root unless noted otherwise.

```bash
# Install dependencies
pnpm install

# Build (compiles TypeScript and copies plugin manifest to dist/)
pnpm build

# Run all tests (once)
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run a single test file (from packages/openclaw-agent-team/)
pnpm vitest run tests/ledger.test.ts

# Lint
pnpm lint
```

## Repository Structure

```
openclaw-agent-team/
├── package.json                  # Monorepo root (pnpm workspace)
├── pnpm-workspace.yaml           # Workspace config: packages/*
├── CLAUDE.md                     # This file
├── docs/
│   └── plans/                    # Design and planning documents
└── packages/
    └── openclaw-agent-team/      # Main plugin package
        ├── package.json
        ├── tsconfig.json
        ├── vitest.config.ts
        ├── openclaw.plugin.json  # Plugin manifest (copied to dist/ on build)
        ├── index.ts              # Re-exports from src/index.ts
        ├── src/                  # Source files
        └── tests/                # Test files
```

## Architecture

The plugin follows a 4-layer architecture with dependencies pointing strictly inward:

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

### Source Modules

#### `src/index.ts` — Plugin Entry Point
Registers the plugin with OpenClaw. Responsibilities:
- Exports `PLUGIN_ID`, `PLUGIN_NAME`, `PLUGIN_DESCRIPTION` constants
- Registers 3 agent tools: `team_create`, `team_shutdown`, `teammate_spawn`
- Registers the `agent-team` channel plugin for inter-agent messaging
- Registers the `before_prompt_build` hook for teammate context injection
- Calls `syncTeammatesToConfig()` on startup to repair missing agent bindings

#### `src/types.ts` — TypeBox Schema Definitions
All types are defined using TypeBox for runtime validation. Key types:
- **`TeamConfig`** — Team metadata: `id`, `team_name`, `description`, `agent_type`, `lead`, `metadata` (createdAt, updatedAt, status)
- **`TeammateDefinition`** — Teammate record: `name`, `agentId`, `sessionKey`, `agentType`, optional `model`/`tools`, `status` (`idle`/`working`/`error`/`shutdown`), `joinedAt`
- **`AgentTeamConfig`** — Plugin configuration: `maxTeammatesPerTeam`, `defaultAgentType`, optional `teamsDir`, `pathTemplates`

Helper functions: `buildTeammateAgentId()`, `parseTeammateAgentId()`
Constants: `TEAMMATE_AGENT_ID_PREFIX`, `AGENT_TEAM_CHANNEL`, `DEFAULT_WORKSPACE_TEMPLATE`, `DEFAULT_AGENT_DIR_TEMPLATE`
Validation: `validateTeamConfig()`, `validateTeammateDefinition()`, `validateAgentTeamConfig()`

#### `src/ledger.ts` — JSONL Member Persistence
`TeamLedger` class using JSONL files with in-memory caches for teammate member tracking. Lazy-loads on first access.

JSONL files (in team directory):
- `members.jsonl` — Teammate member records (sessionKey, name, agentId, agentType, status, joinedAt)

Member methods: `addMember()`, `listMembers()`, `updateMemberStatus()`, `removeMember()`

**Note**: Task tracking functionality is not implemented. The ledger only handles teammate member persistence.

#### `src/storage.ts` — File System Operations
Manages team directories under `~/.openclaw/teams/` (or custom `teamsDir`).

Exports:
- `TEAM_NAME_PATTERN`, `TEAMMATE_NAME_PATTERN` — validation regexes
- `validateTeamName()`, `sanitizeTeammateName()` — name sanitization
- `createTeamDirectory()`, `teamDirectoryExists()`, `deleteTeamDirectory()` — directory lifecycle
- `writeTeamConfig()`, `readTeamConfig()` — JSON config I/O
- `resolveTeammatePaths()`, `resolveTeamPath()`, `getTeamsBaseDir()` — path helpers
- `resolveTemplatePath()` — template-based path resolution

#### `src/channel.ts` — Inter-Agent Messaging Channel
Implements the OpenClaw `ChannelPlugin` interface as the `agent-team` channel.

- Target format: `"teamName:teammateName"` (resolved via `normalizeTarget`)
- Messages written as JSONL to: `{teamsDir}/{teamName}/inbox/{teammateName}/messages.jsonl`
- Capabilities: direct messaging, reply; no polls/threads/media/reactions/edit
- Single hardcoded `"default"` account, always enabled

**Outbound messaging:**
- `resolveTarget()` — validates target format and returns normalized target
- `sendText()` — sends text messages to teammate inbox
- `sendMedia()` — sends media messages with URL to teammate inbox
- All messages include: `id` (UUID), `to`, `timestamp`, `type`, `content`, optional `mediaUrl`
- Path traversal protection via `SAFE_NAME_RE` validation and `resolve()` checks

#### `src/runtime.ts` — Runtime Singleton
Minimal module exposing `setAgentTeamRuntime()`, `getAgentTeamRuntime()`, `resetAgentTeamRuntime()` for accessing the OpenClaw `PluginRuntime` instance.

#### `src/context-injection.ts` — Teammate Context Hook
`createTeammateContextHook()` returns an async hook for the `before_prompt_build` event.
- Only activates for agents with `TEAMMATE_AGENT_ID_PREFIX`
- Builds a markdown context block including team info, teammate role, active member list, and communication instructions

#### `src/dynamic-teammate.ts` — Teammate Spawning Logic
`maybeSpawnTeammate()` handles the full lifecycle of creating a new teammate:
1. Validates teammate name format
2. Checks team is active, not at capacity, no duplicates
3. Creates workspace/agentDir directories
4. Generates `sessionKey`: `agent:{agentId}:main`
5. Adds to ledger and runtime config with bindings

`repairTeammateBinding()` — Adds missing OpenClaw bindings for already-existing agents.

### Tools Layer (`src/tools/`)

#### `team-create.ts`
Input schema: `team_name` (1–50 chars, alphanumeric/hyphens), optional `description`, optional `agent_type`.
Creates team directory, writes `config.json` with a generated UUID, returns `{teamId, teamName, status}`.
Error codes: `DUPLICATE_TEAM_NAME`, `INVALID_TEAM_NAME`, `TEAM_NAME_TOO_LONG`, `EMPTY_TEAM_NAME`

#### `team-shutdown.ts`
Input schema: `team_name`, optional `reason`.
Shuts down all teammates (updates ledger statuses to `"shutdown"`), removes agents/bindings from runtime config, updates team `config.json` status to `"shutdown"`, then **deletes the entire team directory**.
Error codes: `TEAM_NOT_FOUND`, `TEAM_ALREADY_SHUTDOWN`

#### `teammate-spawn.ts`
Input schema: `team_name`, `name`, optional `agent_type`/`model`/`tools` (allow/deny lists).
Uses a per-team mutex (`withTeamLock`) to serialize concurrent spawns. Delegates to `maybeSpawnTeammate()`.
Error codes: `TEAM_NOT_FOUND`, `TEAM_NOT_ACTIVE`, `TEAM_AT_CAPACITY`, `DUPLICATE_TEAMMATE_NAME`, `INVALID_TEAMMATE_NAME`

### Registered Agent Tools

The plugin registers exactly **3 tools** with OpenClaw:

| Tool | Purpose |
|------|---------|
| `team_create` | Create a new team |
| `team_shutdown` | Gracefully shut down a team and delete its data |
| `teammate_spawn` | Spawn a new agent teammate in a team |

### Data Storage Layout

Teams are stored in `~/.openclaw/teams/{team-name}/` (or the configured `teamsDir`):

```
{team-name}/
├── config.json                        # TeamConfig JSON
├── members.jsonl                      # Teammate member records
├── agents/
│   └── {teammateName}/               # Teammate workspace directory
│       ├── workspace/                 # Agent working directory
│       └── agent/                     # Agent directory
└── inbox/
    └── {teammateName}/
        └── messages.jsonl             # Inbound messages for teammate
```

## Testing

- **Framework**: Vitest 3.x with Node environment
- **Location**: `packages/openclaw-agent-team/tests/`
- **Sequential execution**: `fileParallelism: false` to avoid temp directory conflicts
- **Timeout**: 10 seconds for tests and hooks
- **Mock**: `tests/__mocks__/heartbeat-wake.ts` stubs OpenClaw's internal heartbeat module

### Test Files

| File | Covers |
|------|--------|
| `setup.test.ts` | Plugin exports and package.json structure |
| `types.test.ts` | TypeBox schema validation for all types |
| `storage.test.ts` | Directory operations, name validation, config I/O |
| `ledger.test.ts` | Member operations, persistence |
| `index.test.ts` | Plugin registration, tool count, hooks, manifest |
| `dynamic-teammate.test.ts` | Teammate spawning, capacity, duplicates, binding repair |
| `tools/team-create.test.ts` | Team creation, validation errors, directory structure |
| `tools/team-shutdown.test.ts` | Shutdown behavior, directory deletion, config cleanup |
| `tools/teammate-spawn.test.ts` | Spawn tool, agent ID format, tool restrictions |
| `storage/delete-team-directory.test.ts` | Recursive deletion, path traversal protection |
| `integration/teams-dir.test.ts` | Custom vs default teamsDir configuration |

## TypeScript Configuration

- **Target**: ES2022, **Module**: NodeNext
- **Strict mode** enabled with additional checks:
  - `noUnusedLocals`, `noUnusedParameters`
  - `noImplicitReturns`, `noFallthroughCasesInSwitch`
  - `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
  - `noPropertyAccessFromIndexSignature`
- Source: `src/`, Output: `dist/`, excludes `tests/`

## Conventions

### Commit Format

`<type>(<scope>): <description>`

**Types**: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `style`

**Scopes**: `plugin`, `team`, `task`, `agent`, `msg`, `coord`, `config`, `deps`, `ci`, `docs`

### Branch Prefixes

`feature/*`, `fix/*`, `hotfix/*`, `refactor/*`, `docs/*`

### Naming Patterns

- **Team names**: lowercase alphanumeric and hyphens, 1–50 chars (`/^[a-z0-9-]+$/`)
- **Teammate names**: lowercase alphanumeric and hyphens (`/^[a-z0-9-]+$/`); `sanitizeTeammateName()` auto-converts uppercase and replaces invalid chars
- **Agent IDs**: `teammate:{teamName}:{teammateName}` (always lowercase)
- **Session keys**: `agent:{agentId}:main`

### Error Codes

Tools return structured errors with a `code` field:

| Code | Meaning |
|------|---------|
| `DUPLICATE_TEAM_NAME` | Team with that name already exists |
| `INVALID_TEAM_NAME` | Name fails regex or length validation |
| `TEAM_NAME_TOO_LONG` | Name exceeds 50 characters |
| `EMPTY_TEAM_NAME` | Name is empty |
| `MISSING_CALLER_AGENT_ID` | Tool invoked outside an agent session (no caller agentId) |
| `TEAM_NOT_FOUND` | No team with the given name |
| `TEAM_ALREADY_SHUTDOWN` | Team is already in shutdown state |
| `TEAM_NOT_ACTIVE` | Team exists but is not active |
| `TEAM_AT_CAPACITY` | Team has reached `maxTeammatesPerTeam` |
| `DUPLICATE_TEAMMATE_NAME` | Teammate with that name already exists |
| `INVALID_TEAMMATE_NAME` | Name fails regex validation |

## Plugin Development

The plugin manifest (`openclaw.plugin.json`) is copied to `dist/` during build. It defines:

```json
{
  "id": "openclaw-agent-team",
  "configSchema": {
    "maxTeammatesPerTeam": { "type": "number", "default": 10, "min": 1, "max": 50 },
    "defaultAgentType": { "type": "string", "default": "general-purpose" },
    "teamsDir": { "type": "string" }
  }
}
```

For OpenClaw plugin API details, see `docs/plugin.md`.
