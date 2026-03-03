# openclaw-agent-team Plugin Simplified Refactor Plan

## Goal

Simplify the `openclaw-agent-team` plugin by removing duplicate messaging functionality and enhancing `team_shutdown` to fully clean up team resources.

## Constraints

- **NO teammate_remove tool** - teams are deleted directly via `team_shutdown`
- **Keep minimal agent-team channel** - required for routing via `sessions_send`
- **Atomic config updates** - always use `writeConfigFile`
- **Test-first workflow** - verification precedes implementation

## Architecture Impact

```mermaid
graph LR
    A[Before: 9 tools] --> B[After: 7 tools]
    B --> C[Code reduction: ~40%]
```

## Files Summary

### Files to Delete (6 source files + 4 test files)

| File | Lines |
|------|-------|
| `src/mailbox.ts` | ~180 |
| `src/context-injection.ts` | ~80 |
| `src/teammate-invoker.ts` | ~100 |
| `src/reply-dispatcher.ts` | ~65 |
| `src/tools/send-message.ts` | ~195 |
| `src/tools/inbox.ts` | ~115 |
| `tests/mailbox.test.ts` | - |
| `tests/context-injection.test.ts` | - |
| `tests/tools/send-message.test.ts` | - |
| `tests/tools/inbox.test.ts` | - |

### Files to Modify (4 files)

| File | Change |
|------|--------|
| `src/storage.ts` | Add `deleteTeamDirectory()` |
| `src/tools/team-shutdown.ts` | Delete directory after config cleanup |
| `src/types.ts` | Remove message-related types |
| `src/index.ts` | Remove messaging tool registrations |

## Execution Plan

### Phase 1: Storage Enhancement

- [Task 001: Add deleteTeamDirectory Test](./task-001-delete-team-directory-test.md)
- [Task 001: Add deleteTeamDirectory Impl](./task-001-delete-team-directory-impl.md)

### Phase 2: Team Shutdown Enhancement

- [Task 002: Team Shutdown Directory Deletion Test](./task-002-team-shutdown-directory-test.md)
- [Task 002: Team Shutdown Directory Deletion Impl](./task-002-team-shutdown-directory-impl.md)

### Phase 3: Remove Messaging Infrastructure

- [Task 003: Remove mailbox.ts](./task-003-remove-mailbox.md)
- [Task 004: Remove context-injection.ts](./task-004-remove-context-injection.md)
- [Task 005: Remove teammate-invoker.ts](./task-005-remove-teammate-invoker.md)
- [Task 006: Remove reply-dispatcher.ts](./task-006-remove-reply-dispatcher.md)

### Phase 4: Remove Messaging Tools

- [Task 007: Remove send-message.ts](./task-007-remove-send-message.md)
- [Task 008: Remove inbox.ts](./task-008-remove-inbox.md)

### Phase 5: Clean Up Types

- [Task 009: Remove message types from types.ts](./task-009-remove-message-types.md)

### Phase 6: Update Entry Point

- [Task 010: Update index.ts](./task-010-update-index.md)

### Phase 7: Clean Up Tests

- [Task 011: Delete messaging test files](./task-011-delete-test-files.md)

### Phase 8: Final Verification

- [Task 012: Run all tests and verify](./task-012-final-verification.md)

## Success Criteria

- [ ] All existing tests pass
- [ ] `team_shutdown` deletes team directory
- [ ] `team_shutdown` removes all agents & bindings from openclaw.json
- [ ] No messaging-related code remains in src/
- [ ] Code size reduced by ~40% (~735 lines removed)

## Design Reference

This plan is based on: [docs/plans/2026-03-03-simplified-refactor-design/](../2026-03-03-simplified-refactor-design/)
