# Migration Plan: Remove Task Functionality

## Overview

This plan removes all task-related functionality from the `openclaw-agent-team` plugin, reducing it to 3 tools: `team_create`, `team_shutdown`, and `teammate_spawn`.

## Current State

The plugin currently has:
- **7 tools**: team_create, team_shutdown, teammate_spawn, task_create, task_list, task_claim, task_complete
- **Ledger dependency**: Used by teammate_spawn (capacity/duplicate check) and team_shutdown (member list)
- **SQLite ledger**: Stores tasks, members, and dependencies

## Files to Delete

### Source Files

| File | Description |
|------|-------------|
| `src/ledger.ts` | Task/member/dependency persistence (~300 lines) |
| `src/tools/task-create.ts` | Create task tool |
| `src/tools/task-list.ts` | List tasks tool |
| `src/tools/task-claim.ts` | Claim task tool |
| `src/tools/task-complete.ts` | Complete task tool |

### Test Files

| File | Description |
|------|-------------|
| `tests/ledger.test.ts` | Ledger unit tests |
| `tests/tools/task-create.test.ts` | Task create tests |
| `tests/tools/task-list.test.ts` | Task list tests |
| `tests/tools/task-claim.test.ts` | Task claim tests |
| `tests/tools/task-complete.test.ts` | Task complete tests |

## Files to Modify

### 1. `src/index.ts`

Remove:
- Import `TeamLedger` from ledger.ts
- Import task tool creators (task-create, task-list, task-claim, task-complete)
- Task tool registrations (4 tools)
- `getTeamLedger` from PluginContext
- `TeamLedger` export

Modify:
- `createPluginContext()` - Remove ledger cache and `getTeamLedger` method

### 2. `src/types.ts`

Remove:
- `TaskStatusSchema`
- `TaskStatus`
- `TaskSchema`
- `Task`

### 3. `src/tools/teammate-spawn.ts`

Remove:
- Import `TeamLedger` from ledger.js
- `ledger.listMembers()` calls
- `ledger.addMember()` call
- Ledger open/close

Modify:
- Check capacity via openclaw.json (count agents with matching team prefix)
- Check duplicate names via openclaw.json (find agent with same name)
- Remove member tracking entirely

### 4. `src/tools/team-shutdown.ts`

Remove:
- Import `TeamLedger` from ledger.js
- `ledger.listMembers()` call
- `ledger.updateMemberStatus()` calls
- Ledger open/close

Modify:
- Find teammates via openclaw.json (filter agents/bindings by team prefix)
- Remove member status update loop

## Migration Tasks

### Phase 1: Remove Task Tools (No Dependencies)

| Task | File | Action |
|------|------|--------|
| 1.1 | `src/tools/task-create.ts` | Delete |
| 1.2 | `src/tools/task-list.ts` | Delete |
| 1.3 | `src/tools/task-claim.ts` | Delete |
| 1.4 | `src/tools/task-complete.ts` | Delete |
| 1.5 | `tests/tools/task-create.test.ts` | Delete |
| 1.6 | `tests/tools/task-list.test.ts` | Delete |
| 1.7 | `tests/tools/task-claim.test.ts` | Delete |
| 1.8 | `tests/tools/task-complete.test.ts` | Delete |

### Phase 2: Remove Ledger

| Task | File | Action |
|------|------|--------|
| 2.1 | `src/ledger.ts` | Delete |
| 2.2 | `tests/ledger.test.ts` | Delete |

### Phase 3: Update teammate-spawn.ts

Replace ledger usage with openclaw.json lookup:

```typescript
// Before (uses ledger)
const ledger = new TeamLedger(ledgerPath);
const currentMembers = await ledger.listMembers();
// Check capacity and duplicates via ledger
await ledger.addMember(teammate);

// After (uses openclaw.json)
const cfg = await runtime.config.loadConfig();
const teamAgents = cfg.agents.list.filter(a =>
  a.id.startsWith(`teammate-${team_name}-`)
);
// Check capacity and duplicates via teamAgents
// No addMember needed - agent registered directly in openclaw.json
```

### Phase 4: Update team-shutdown.ts

Replace ledger usage with openclaw.json lookup:

```typescript
// Before (uses ledger)
const ledger = new TeamLedger(ledgerPath);
const members = await ledger.listMembers();
const teammateAgentIds = new Set(members.map((m) => m.agentId));

// After (uses openclaw.json)
const cfg = await runtime.config.loadConfig();
const teammateAgentIds = new Set(
  cfg.agents.list
    .filter(a => a.id.startsWith(`teammate-${team_name}-`))
    .map(a => a.id)
);
```

### Phase 5: Update index.ts

Remove task tool registrations and ledger exports:

```typescript
// Remove these imports
import { createTaskCreateTool } from "./tools/task-create.js";
import { createTaskListTool } from "./tools/task-list.js";
import { createTaskClaimTool } from "./tools/task-claim.js";
import { createTaskCompleteTool } from "./tools/task-complete.js";
import { TeamLedger } from "./ledger.js";

// Remove from PluginContext
getTeamLedger(teamName: string): TeamLedger;  // DELETE

// Remove from registerTeamTools()
// All task tool registrations (4 tools)

// Remove exports
export { TeamLedger } from "./ledger.js";  // DELETE
```

### Phase 6: Update types.ts

Remove Task-related types:

```typescript
// Remove these
export const TaskStatusSchema = Type.Union([...]);
export type TaskStatus = Static<typeof TaskStatusSchema>;
export const TaskSchema = Type.Object({...});
export type Task = Static<typeof TaskSchema>;
```

### Phase 7: Update Tests

| Task | File | Action |
|------|------|--------|
| 7.1 | `tests/tools/teammate-spawn.test.ts` | Remove ledger-related assertions |
| 7.2 | `tests/tools/team-shutdown.test.ts` | Remove ledger-related assertions |
| 7.3 | `tests/index.test.ts` | Remove task tool tests |

### Phase 8: Verification

| Task | Action |
|------|--------|
| 8.1 | Run build: `pnpm build` |
| 8.2 | Run tests: `pnpm test` |
| 8.3 | Verify 3 tools registered in index.ts |

## Verification Commands

```bash
# Verify source files deleted
ls packages/openclaw-agent-team/src/ledger.ts 2>&1 | grep -q "No such file" && echo "OK: ledger.ts deleted"
ls packages/openclaw-agent-team/src/tools/task-*.ts 2>&1 | grep -q "No such file" && echo "OK: task tools deleted"

# Verify no imports remain
grep -r "ledger" packages/openclaw-agent-team/src/ || echo "OK - no ledger imports"
grep -r "task-create\|task-list\|task-claim\|task-complete" packages/openclaw-agent-team/src/ || echo "OK - no task tool imports"

# Verify test files deleted
ls packages/openclaw-agent-team/tests/ledger.test.ts 2>&1 | grep -q "No such file" && echo "OK: ledger.test.ts deleted"
ls packages/openclaw-agent-team/tests/tools/task-*.test.ts 2>&1 | grep -q "No such file" && echo "OK: task test files deleted"

# Build should succeed
pnpm build

# Tests should pass
pnpm test

# Verify tool count (should be 3)
grep -c "registerTool" packages/openclaw-agent-team/src/index.ts
# Expected output: 3
```

## Success Criteria

- [ ] All 4 task tools deleted
- [ ] Ledger.ts deleted
- [ ] Task types removed from types.ts
- [ ] Teammate-spawn uses openclaw.json for capacity/duplicate checks
- [ ] Team-shutdown uses openclaw.json for teammate list
- [ ] Index.ts only registers 3 tools (team_create, team_shutdown, teammate_spawn)
- [ ] Index.ts exports no Task or Ledger types
- [ ] Build succeeds
- [ ] All remaining tests pass
- [ ] No orphaned imports

## Rollback Plan

If issues arise:
1. `git checkout -- packages/openclaw-agent-team/src/` - Restore all source files
2. `git checkout -- packages/openclaw-agent-team/tests/` - Restore all test files
3. `pnpm build && pnpm test` - Verify rollback

## Timeline

| Phase | Duration | Description |
|-------|----------|-------------|
| Phase 1 | 5 min | Delete task tool files |
| Phase 2 | 2 min | Delete ledger and tests |
| Phase 3 | 10 min | Update teammate-spawn.ts |
| Phase 4 | 10 min | Update team-shutdown.ts |
| Phase 5 | 5 min | Update index.ts |
| Phase 6 | 3 min | Update types.ts |
| Phase 7 | 10 min | Update tests |
| Phase 8 | 5 min | Verification |

**Total: ~50 minutes**
