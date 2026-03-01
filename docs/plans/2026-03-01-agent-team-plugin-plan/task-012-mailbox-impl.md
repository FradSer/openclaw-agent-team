# Task 012: Mailbox Module Impl

## Summary

Implement the mailbox module for JSONL-based inter-agent messaging with persistence.

## BDD Scenario

```gherkin
Feature: Mailbox Implementation

  Scenario: All mailbox functions are exported
    Given the mailbox module is implemented
    When I import from src/mailbox.ts
    Then Mailbox class is exported
    And sendDirectMessage is available
    And broadcast is available
    And readInbox is available
```

## What to Implement

Create `src/mailbox.ts` with:

1. **Constants**:
   - `MAX_MESSAGE_SIZE = 100 * 1024` (100KB)

2. **Mailbox class**:
   - Constructor: `constructor(teamsDir: string, teamName: string)`
   - `sendDirectMessage(params)`: Send to specific recipient
   - `broadcast(params)`: Send to all teammates
   - `readInbox(sessionKey, options?)`: Read messages for session

3. **Message format** (JSONL):
   ```typescript
   {
     id: string;           // UUID
     from: string;         // Sender session key
     to?: string;          // Recipient (undefined for broadcast)
     type: "message" | "broadcast" | "task_update" | "shutdown_request";
     content: string;
     summary?: string;     // 5-10 word summary
     timestamp: number;    // Unix ms
   }
   ```

4. **File structure**:
   - `inbox/{sessionKey}/messages.jsonl`

5. **Implementation details**:
   - Append-only writes (no locking needed)
   - Each line is a complete JSON object
   - Read all lines, filter by recipient
   - Clear by truncating file after read

6. **Error handling**:
   - Message too large -> validation error
   - Recipient not found -> not_found error
   - File I/O errors -> system error

## Verification

```bash
# Run mailbox tests (should PASS)
cd packages/openclaw-agent-team && pnpm vitest run tests/mailbox.test.ts

# Verify TypeScript compilation
cd packages/openclaw-agent-team && pnpm tsc --noEmit
```

## Files to Create

- `src/mailbox.ts`

## depends-on

- [Task 012: Mailbox Module Test](./task-012-mailbox-test.md)
