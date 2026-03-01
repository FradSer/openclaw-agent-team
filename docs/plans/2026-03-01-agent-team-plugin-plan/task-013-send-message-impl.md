# Task 013: Send Message Impl

## Summary

Implement the send_message tool that sends messages to teammates via the mailbox system.

## BDD Scenario

```gherkin
Feature: Send Message Implementation

  Scenario: send_message tool is properly registered
    Given the send-message module is implemented
    When I import from src/tools/send-message.ts
    Then createSendMessageTool function is exported
    And it returns an AnyAgentTool with:
      | label     | Send Message       |
      | name      | send_message       |
      | parameters | SendMessageSchema |
```

## What to Implement

Create `src/tools/send-message.ts` with:

1. **SendMessageSchema** (TypeBox):
   - type: enum "message" | "broadcast" (required)
   - recipient: string (required for "message" type)
   - content: string (required)
   - summary: string (required, 5-10 words)

2. **createSendMessageTool(ctx)** function that returns `AnyAgentTool`:
   - label: "Send Message"
   - name: "send_message"
   - description: "Sends a message to a teammate or broadcasts to all"
   - parameters: SendMessageSchema
   - execute: async handler that:
     - Validates content size < 100KB
     - For "message": validates recipient exists, sends direct
     - For "broadcast": sends to all teammates
     - Requests heartbeat wake for recipients
     - Returns { messageId, delivered, recipientCount }

3. **Error handling**:
   - Recipient not found -> not_found error
   - Message too large -> validation error
   - Team not found -> not_found error

4. **Response format**:
   ```typescript
   {
     messageId: string;
     delivered: boolean;
     recipientCount: number;
   }
   ```

## Verification

```bash
# Run send_message tests (should PASS)
cd packages/openclaw-agent-team && pnpm vitest run tests/tools/send-message.test.ts

# Verify TypeScript compilation
cd packages/openclaw-agent-team && pnpm tsc --noEmit
```

## Files to Create

- `src/tools/send-message.ts`

## depends-on

- [Task 013: Send Message Test](./task-013-send-message-test.md)
