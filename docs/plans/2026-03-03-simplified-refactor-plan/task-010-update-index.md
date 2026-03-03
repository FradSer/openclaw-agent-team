# Task 010: Update index.ts

## BDD Scenario

```gherkin
Feature: Update Plugin Entry Point

  Scenario: Messaging tool registrations are removed from index.ts
    Given the file "src/index.ts" imports and registers:
      | createSendMessageTool   |
      | createInboxTool         |
      | createContextInjectionHook |
    When I remove all messaging-related imports and registrations
    Then the file should only register 7 tools (team_create, team_shutdown, teammate_spawn, task_create, task_list, task_claim, task_complete)
    And the file should NOT import context-injection
    And the file should NOT export invokeTeammate
    And the before_prompt_build hook should NOT be registered
    And the build should succeed
```

## What to Remove

Remove from `src/index.ts`:

1. Import `createSendMessageTool` from `./tools/send-message.js`
2. Import `createInboxTool` from `./tools/inbox.js`
3. Import `createContextInjectionHook` from `./context-injection.js`
4. Import `invokeTeammate` from `./teammate-invoker.js`
5. Registration of `send_message` tool
6. Registration of `inbox` tool
7. Registration of `before_prompt_build` hook
8. Export of `invokeTeammate`

## What to Keep

The file should still register these 7 tools:
- `team_create`
- `team_shutdown`
- `teammate_spawn`
- `task_create`
- `task_list`
- `task_claim`
- `task_complete`

## Files

| File | Action |
|------|--------|
| `src/index.ts` | Modify - remove messaging imports, registrations, and exports |

## Verification

```bash
# Verify messaging imports are removed
grep -E "(send-message|inbox|context-injection|teammate-invoker)" packages/openclaw-agent-team/src/index.ts || echo "OK - no messaging imports"

# Verify tool count (should be 7)
grep -c "registerTool" packages/openclaw-agent-team/src/index.ts

# Verify no hook registration
grep "before_prompt_build" packages/openclaw-agent-team/src/index.ts || echo "OK - no hook"

# Build should succeed
npm run build
```

Expected: No messaging imports, 7 tool registrations, no hook, build succeeds.

## **depends-on**

- [Task 003: Remove mailbox.ts](./task-003-remove-mailbox.md)
- [Task 004: Remove context-injection.ts](./task-004-remove-context-injection.md)
- [Task 005: Remove teammate-invoker.ts](./task-005-remove-teammate-invoker.md)
- [Task 006: Remove reply-dispatcher.ts](./task-006-remove-reply-dispatcher.md)
- [Task 007: Remove send-message.ts](./task-007-remove-send-message.md)
- [Task 008: Remove inbox.ts](./task-008-remove-inbox.md)
- [Task 009: Remove message types](./task-009-remove-message-types.md)

All files being referenced must be deleted/updated first.
