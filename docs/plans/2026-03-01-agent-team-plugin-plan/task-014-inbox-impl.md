# Task 014: Inbox Impl

## Summary

Implement the inbox tool that reads pending messages for the current teammate.

## BDD Scenario

```gherkin
Feature: Inbox Implementation

  Scenario: inbox tool is properly registered
    Given the inbox module is implemented
    When I import from src/tools/inbox.ts
    Then createInboxTool function is exported
    And it returns an AnyAgentTool with:
      | label     | Inbox       |
      | name      | inbox       |
      | parameters | InboxSchema |
```

## What to Implement

Create `src/tools/inbox.ts` with:

1. **InboxSchema** (TypeBox):
   - limit: number (optional, default all)
   - clear: boolean (optional, default false)

2. **createInboxTool(ctx)** function that returns `AnyAgentTool`:
   - label: "Inbox"
   - name: "inbox"
   - description: "Reads pending messages for the current teammate"
   - parameters: InboxSchema
   - execute: async handler that:
     - Validates current session is a teammate
     - Parses team info from agentId
     - Reads messages from mailbox
     - Applies limit if specified
     - Clears inbox if clear=true
     - Returns array of messages

3. **Error handling**:
   - Not a teammate session -> forbidden error
   - Team not found -> not_found error

4. **Response format**:
   ```typescript
   {
     messages: Array<{
       id: string;
       from: string;
       type: string;
       content: string;
       summary?: string;
       timestamp: number;
     }>;
     cleared: boolean;
   }
   ```

## Verification

```bash
# Run inbox tests (should PASS)
cd packages/openclaw-agent-team && pnpm vitest run tests/tools/inbox.test.ts

# Verify TypeScript compilation
cd packages/openclaw-agent-team && pnpm tsc --noEmit
```

## Files to Create

- `src/tools/inbox.ts`

## depends-on

- [Task 014: Inbox Test](./task-014-inbox-test.md)
