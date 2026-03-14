# openclaw-agent-team Plugin Refactor - Requirements Traceability Matrix

**Document Version:** 1.0
**Date:** 2026-03-03
**Author:** Claude Code

---

## Context Summary

### Project Overview

The `openclaw-agent-team` plugin enables multi-agent team coordination within OpenClaw. This refactor aims to simplify the plugin by removing duplicate functionality that exists in OpenClaw core.

### Problem Statement

The plugin currently duplicates functionality:
- `send_message` / `inbox` tools duplicate core's `sessions_send` and session history
- `Mailbox` class duplicates core message storage
- `teammate-invoker` and `reply-dispatcher` are complex workarounds for direct agent invocation

### Refactor Goals

1. Remove duplicate messaging - use core's `sessions_send` instead
2. Use `writeConfigFile` for dynamic agent creation with proper cleanup
3. Simplify the plugin to focus on its unique value: Team/Task management
4. Reduce code size by approximately 50%

### Current vs Target Tool Count

| Category | Current | Target |
|----------|---------|--------|
| Team Management | 2 | 2 |
| Teammate Management | 1 | 2 (add `teammate_remove`) |
| Task Management | 0 (not yet created) | 4 |
| Messaging | 0 (removed) | 0 |
| **Total** | **3** | **8** |

---

## Functional Requirements

### Team Management

| ID | Requirement | Priority | Source | Implementation | Test Coverage |
|----|-------------|----------|--------|----------------|---------------|
| FR-TM-001 | `team_create` creates team config in `~/.openclaw/teams/{team}/config.json` | Must | Design R1 | `tools/team-create.ts` (unchanged) | BDD: Team Creation |
| FR-TM-002 | Team config includes id, team_name, description (optional), agent_type, lead, metadata | Must | Design R1 | `types.ts` TeamConfigSchema | Unit tests |
| FR-TM-003 | `team_create` rejects duplicate team names with error code `DUPLICATE_TEAM_NAME` | Must | BDD | `tools/team-create.ts` | BDD: Reject duplicate team name |
| FR-TM-004 | `team_create` validates team name (no path traversal, alphanumeric + hyphens) | Must | BDD | `tools/team-create.ts` | BDD: Reject invalid team name |
| FR-TM-005 | `team_shutdown` removes all agents from openclaw.json | Must | Design R2 | `tools/team-shutdown.ts` (modified) | BDD: Team Shutdown |
| FR-TM-006 | `team_shutdown` removes all bindings from openclaw.json | Must | Design R2 | `tools/team-shutdown.ts` (modified) | BDD: Team Shutdown |
| FR-TM-007 | `team_shutdown` deletes team directory recursively | Must | Design R2 | `tools/team-shutdown.ts` (modified) | BDD: Shutdown removes team directory |
| FR-TM-008 | `team_shutdown` updates member status to "shutdown" in ledger | Must | Design R2 | `tools/team-shutdown.ts` | Unit tests |
| FR-TM-009 | `team_shutdown` rejects non-existent team with error code `TEAM_NOT_FOUND` | Must | BDD | `tools/team-shutdown.ts` | BDD: Reject shutdown of non-existent team |
| FR-TM-010 | `team_shutdown` rejects already shutdown team with error code `TEAM_ALREADY_SHUTDOWN` | Must | BDD | `tools/team-shutdown.ts` | Unit tests |

### Teammate Management

| ID | Requirement | Priority | Source | Implementation | Test Coverage |
|----|-------------|----------|--------|----------------|---------------|
| FR-SP-001 | `teammate_spawn` creates agent definition in openclaw.json with id `teammate-{team}-{name}` | Must | Design R3 | `tools/teammate-spawn.ts` (modified) | BDD: Teammate Spawn |
| FR-SP-002 | `teammate_spawn` creates binding in openclaw.json for `agent-team` channel | Must | Design R3 | `tools/teammate-spawn.ts` (modified) | BDD: Teammate Spawn |
| FR-SP-003 | `teammate_spawn` creates workspace directory at `~/.openclaw/teams/{team}/agents/{name}/workspace` | Must | Design | `tools/teammate-spawn.ts` | Unit tests |
| FR-SP-004 | `teammate_spawn` creates agentDir at `~/.openclaw/teams/{team}/agents/{name}/agent` | Must | Design | `tools/teammate-spawn.ts` | Unit tests |
| FR-SP-005 | `teammate_spawn` adds member to ledger | Must | Design | `tools/teammate-spawn.ts` | Unit tests |
| FR-SP-006 | `teammate_spawn` validates max teammates limit (default: 10) | Must | Design | `tools/teammate-spawn.ts` | BDD: Reject spawn when team at capacity |
| FR-SP-007 | `teammate_spawn` rejects duplicate name with error code `DUPLICATE_TEAMMATE_NAME` | Must | BDD | `tools/teammate-spawn.ts` | BDD: Reject duplicate teammate name |
| FR-SP-008 | `teammate_spawn` rejects spawn into non-existent team with error code `TEAM_NOT_FOUND` | Must | BDD | `tools/teammate-spawn.ts` | BDD: Reject spawn into non-existent team |
| FR-SP-009 | `teammate_spawn` rejects spawn into inactive team with error code `TEAM_NOT_ACTIVE` | Must | BDD | `tools/teammate-spawn.ts` | Unit tests |
| FR-SP-010 | `teammate_spawn` supports optional model parameter | Should | BDD | `tools/teammate-spawn.ts` | BDD: Spawn teammate with model specification |
| FR-SP-011 | `teammate_spawn` supports optional tools allow/deny lists | Should | Design | `tools/teammate-spawn.ts` | Unit tests |
| FR-SP-012 | `teammate_spawn` returns `{ agentId, name, sessionKey, status }` | Must | Design | `tools/teammate-spawn.ts` | Unit tests |
| FR-RM-001 | `teammate_remove` removes agent from openclaw.json | Must | Design R4 | `tools/teammate-remove.ts` (NEW) | BDD: Teammate Remove |
| FR-RM-002 | `teammate_remove` removes binding from openclaw.json | Must | Design R4 | `tools/teammate-remove.ts` (NEW) | BDD: Teammate Remove |
| FR-RM-003 | `teammate_remove` updates member status to "removed" in ledger | Must | Design | `tools/teammate-remove.ts` (NEW) | Unit tests |
| FR-RM-004 | `teammate_remove` rejects non-existent teammate with error code `TEAMMATE_NOT_FOUND` | Must | BDD | `tools/teammate-remove.ts` (NEW) | BDD: Teammate Remove |
| FR-RM-005 | `teammate_remove` rejects non-existent team with error code `TEAM_NOT_FOUND` | Must | BDD | `tools/teammate-remove.ts` (NEW) | BDD: Teammate Remove |

### Task Management (Not Yet Created)

| ID | Requirement | Priority | Source | Implementation | Test Coverage |
|----|-------------|----------|--------|----------------|---------------|
| FR-TK-001 | `task_create` creates task with subject, description, optional dependencies | Must | Design R6 | `tools/task-create.ts` (TODO) | BDD: Task Creation |
| FR-TK-002 | `task_create` rejects circular dependencies with error code `CIRCULAR_DEPENDENCY` | Must | BDD | `tools/task-create.ts` | BDD: Task Creation |
| FR-TK-003 | `task_create` rejects non-existent blocking task with error code `BLOCKING_TASK_NOT_FOUND` | Must | BDD | `tools/task-create.ts` | BDD: Task Creation |
| FR-TK-004 | `task_list` returns tasks with filters: status, owner, includeCompleted | Must | Design R6 | `tools/task-list.ts` (TODO) | BDD: Task List |
| FR-TK-005 | `task_list` returns empty array for team with no tasks | Must | BDD | `tools/task-list.ts` | BDD: Task List |
| FR-TK-006 | `task_claim` claims available task for session owner | Must | Design R6 | `tools/task-claim.ts` (TODO) | BDD: Task Claim |
| FR-TK-007 | `task_claim` rejects already claimed task with error code `TASK_ALREADY_CLAIMED` | Must | BDD | `tools/task-claim.ts` | BDD: Task Claim |
| FR-TK-008 | `task_claim` rejects blocked task with error code `TASK_IS_BLOCKED` | Must | BDD | `tools/task-claim.ts` | BDD: Task Claim |
| FR-TK-009 | `task_complete` marks claimed task as completed | Must | Design R6 | `tools/task-complete.ts` (TODO) | BDD: Task Complete |
| FR-TK-010 | `task_complete` rejects task owned by another with error code `NOT_TASK_OWNER` | Must | BDD | `tools/task-complete.ts` | BDD: Task Complete |
| FR-TK-011 | Completing task unblocks dependent tasks | Must | BDD | `tools/task-complete.ts` | BDD: Task Complete |

### Messaging (Removed)

| ID | Requirement | Priority | Source | Implementation | Test Coverage |
|----|-------------|----------|--------|----------------|---------------|
| FR-MSG-001 | Messaging uses core's `sessions_send` instead of custom tools | Must | Design R5 | Removed from plugin | Integration tests |
| FR-MSG-002 | Remove `send_message` tool | Must | Design | Delete `tools/send-message.ts` | N/A |
| FR-MSG-003 | Remove `inbox` tool | Must | Design | Delete `tools/inbox.ts` | N/A |
| FR-MSG-004 | Remove `Mailbox` class | Must | Design | Delete `mailbox.ts` | N/A |
| FR-MSG-005 | Remove context injection hook | Must | Design | Delete `context-injection.ts` | N/A |
| FR-MSG-006 | Remove `teammate-invoker.ts` | Must | Design | Delete `teammate-invoker.ts` | N/A |
| FR-MSG-007 | Remove `reply-dispatcher.ts` | Must | Design | Delete `reply-dispatcher.ts` | N/A |

---

## Non-Functional Requirements

| ID | Requirement | Priority | Source | Verification Method |
|----|-------------|----------|--------|---------------------|
| NFR-001 | Config updates must be atomic (use `writeConfigFile`) | Must | Design NF1 | Code review + Integration tests |
| NFR-002 | Cleanup must be complete (no orphaned agents/bindings) | Must | Design NF2 | Integration tests |
| NFR-003 | Plugin code size should reduce by ~50% | Should | Design NF3 | Line count comparison |
| NFR-004 | All existing tests must pass after refactor | Must | Design | CI pipeline |
| NFR-005 | Concurrent task claims must be handled safely | Must | BDD | Concurrency tests |
| NFR-006 | Ledger must persist across concurrent operations | Must | BDD | Concurrency tests |
| NFR-007 | Directory permissions must be secure (0o700) | Should | Best practices | Unit tests |

---

## Files to Delete

| File | Lines | Reason | Status |
|------|-------|--------|--------|
| `src/mailbox.ts` | 184 | Replaced by sessions_send | DELETED |
| `src/teammate-invoker.ts` | 99 | Replaced by sessions_send | DELETED |
| `src/reply-dispatcher.ts` | 65 | Use core mechanisms | DELETED |
| `src/tools/send-message.ts` | 194 | Replaced by sessions_send | DELETED |
| `src/tools/inbox.ts` | 113 | Replaced by session history | DELETED |
| `src/context-injection.ts` | 100 | No longer needed | pending |

**Lines already removed:** ~755

---

## Files to Keep/Modify

| File | Action | Changes Required | Status |
|------|--------|------------------|--------|
| `src/index.ts` | Modify | Remove context injection hook registration | pending |
| `src/types.ts` | Keep | No changes required | done |
| `src/ledger.ts` | Keep | No changes required | done |
| `src/storage.ts` | Keep | No changes required | done |
| `src/runtime.ts` | Keep | No changes required | done |
| `src/channel.ts` | Keep | Minimal channel plugin (unchanged) | done |
| `src/dynamic-teammate.ts` | Refactor | Extract into `agent-manager.ts` | pending |
| `src/context-injection.ts` | Delete | No longer needed | pending |
| `src/tools/team-create.ts` | Keep | No changes required | done |
| `src/tools/team-shutdown.ts` | Modify | Use AgentManager for batch removal | pending |
| `src/tools/teammate-spawn.ts` | Modify | Delegate to AgentManager | pending |

### New Files to Create

| File | Purpose | Status |
|------|---------|--------|
| `src/core/agent-manager.ts` | Dynamic agent lifecycle management (createAgent, removeAgent, listTeamAgents) | TODO |
| `src/tools/teammate-remove.ts` | Tool to remove a single teammate | TODO |
| `src/tools/task-create.ts` | Task creation with dependency support | TODO |
| `src/tools/task-list.ts` | Task listing with filters | TODO |
| `src/tools/task-claim.ts` | Task claiming | TODO |
| `src/tools/task-complete.ts` | Task completion | TODO |

---

## Success Criteria

| ID | Criterion | Verification |
|----|-----------|--------------|
| SC-001 | All existing tests pass | `pnpm test` exits with 0 |
| SC-002 | `teammate_spawn` creates agents + bindings in openclaw.json | Integration test |
| SC-003 | `team_shutdown` removes all agents + bindings from openclaw.json | Integration test |
| SC-004 | `team_shutdown` deletes team directory | Integration test |
| SC-005 | Messaging works via `sessions_send` | Manual testing / Integration test |
| SC-006 | Code size reduced by ~50% | `find src -name "*.ts" \| xargs wc -l` |
| SC-007 | No orphaned agents/bindings after shutdown | Config inspection |
| SC-008 | No TypeScript compilation errors | `pnpm build` exits with 0 |
| SC-009 | No lint errors | `pnpm lint` exits with 0 |

---

## Migration Path

### Phase 1: Messaging Deletion (COMPLETE)

| Step | Action | Files | Status |
|------|--------|-------|--------|
| 1.1 | Delete `mailbox.ts` | `src/mailbox.ts` | DONE |
| 1.2 | Delete `send-message.ts` | `src/tools/send-message.ts` | DONE |
| 1.3 | Delete `inbox.ts` | `src/tools/inbox.ts` | DONE |
| 1.4 | Delete `teammate-invoker.ts` | `src/teammate-invoker.ts` | DONE |
| 1.5 | Delete `reply-dispatcher.ts` | `src/reply-dispatcher.ts` | DONE |

### Phase 2: Context Injection Cleanup

| Step | Action | Files |
|------|--------|-------|
| 2.1 | Delete `context-injection.ts` | `src/context-injection.ts` |
| 2.2 | Remove hook registration from `index.ts` | `src/index.ts` |

### Phase 3: Agent Manager Refactor

| Step | Action | Files |
|------|--------|-------|
| 3.1 | Create `src/core/agent-manager.ts` (extract from `dynamic-teammate.ts`) | New file |
| 3.2 | Refactor `teammate-spawn.ts` to use AgentManager | Modify |
| 3.3 | Refactor `team-shutdown.ts` to use AgentManager | Modify |
| 3.4 | Write unit tests for AgentManager | New test file |

### Phase 4: New Tools

| Step | Action | Files |
|------|--------|-------|
| 4.1 | Create `teammate-remove.ts` | New file |
| 4.2 | Create task tools (`task-create`, `task-list`, `task-claim`, `task-complete`) | New files |
| 4.3 | Register new tools in `index.ts` | Modify |
| 4.4 | Write tests for new tools | New test files |

### Phase 5: Validation

| Step | Action | Verification |
|------|--------|--------------|
| 5.1 | Run all unit tests | `pnpm test` |
| 5.2 | Run lint | `pnpm lint` |
| 5.3 | Build plugin | `pnpm build` |
| 5.4 | Integration test with OpenClaw core | Manual |

---

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Directory deletion fails on Windows | Medium | Low | Use recursive delete with error handling |
| Existing teams break after upgrade | High | Low | Migration script or compatibility check |
| Tests fail after deletion | Medium | Medium | Phase-based deletion with test runs between phases |
| Binding routing changes | High | Medium | Verify routing still works after refactor |

Note: `runtime.config.loadConfig()` and `runtime.config.writeConfigFile()` are confirmed official public API in `PluginRuntimeCore` from `openclaw/plugin-sdk`. No risk from using these methods.

---

## Dependencies

### Internal Dependencies

- `openclaw/plugin-sdk` - PluginRuntime interface
- `@sinclair/typebox` - Schema definitions

### Runtime Dependencies

- OpenClaw core >=1.0.0
- Node.js >=18.0.0

---

## Appendix: Traceability Matrix Summary

### Requirements to Implementation

```
FR-TM-001..010 --> tools/team-create.ts, tools/team-shutdown.ts
FR-SP-001..012 --> tools/teammate-spawn.ts, core/agent-manager.ts
FR-RM-001..005 --> tools/teammate-remove.ts, core/agent-manager.ts
FR-TK-001..011 --> tools/task-*.ts (unchanged)
FR-MSG-001..007 --> DELETED FILES
```

### Requirements to Tests

```
FR-TM-* --> tests/features/team-lifecycle.test.ts
FR-SP-* --> tests/features/teammate-lifecycle.test.ts
FR-RM-* --> tests/features/teammate-lifecycle.test.ts
FR-TK-* --> tests/features/task-management.test.ts
NFR-*    --> tests/features/config-sync.test.ts, tests/features/error-handling.test.ts
```

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-03 | Claude Code | Initial creation |
| 1.1 | 2026-03-14 | Claude Code | Reflect actual state: messaging files deleted, task tools not yet created, `dynamic-teammate.ts` exists, `runtime.config` confirmed official API |
