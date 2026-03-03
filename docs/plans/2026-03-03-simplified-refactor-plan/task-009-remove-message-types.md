# Task 009: Remove message types from types.ts

## BDD Scenario

```gherkin
Feature: Clean Up Type Definitions

  Scenario: Message-related types are removed from types.ts
    Given the file "src/types.ts" contains message types:
      | TeamMessageSchema         |
      | TeamMessageTypeSchema     |
      | SendMessageParamsSchema   |
      | InboxParamsSchema         |
    When I remove all message-related type definitions
    Then the file should NOT contain any message-related types
    And the file should still export TeamConfig, Task, Member types
    And the build should succeed
```

## What to Remove

Remove the following from `src/types.ts`:

1. `TeamMessageSchema` - TypeBox schema for messages
2. `TeamMessageTypeSchema` - Enum schema for message types
3. `SendMessageParamsSchema` - Params for send_message tool
4. `InboxParamsSchema` - Params for inbox tool
5. Related type exports: `TeamMessage`, `TeamMessageType`, `SendMessageParams`, `InboxParams`

## Files

| File | Action |
|------|--------|
| `src/types.ts` | Modify - remove message-related type definitions |

## Verification

```bash
# Verify message types are removed
grep -E "(TeamMessage|SendMessage|InboxParams)" packages/openclaw-agent-team/src/types.ts || echo "OK - no message types"

# Verify core types still exist
grep -E "(TeamConfig|Task|Member)" packages/openclaw-agent-team/src/types.ts

# Build should succeed
npm run build
```

Expected: No message types found, core types present, build succeeds.

## **depends-on**

- [Task 007: Remove send-message.ts](./task-007-remove-send-message.md)
- [Task 008: Remove inbox.ts](./task-008-remove-inbox.md)

These tools must be removed first since their param types will be deleted.
