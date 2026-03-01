# Task 013: Send Message Test

## Summary

Write failing tests for the send_message tool that sends messages to teammates via the mailbox system.

## BDD Scenario

```gherkin
Feature: Send Message

  Scenario: Send direct message to teammate
    Given teammate "researcher" exists in team "project"
    When I call send_message with:
      | recipient | researcher              |
      | content   | Focus on the API design |
      | summary   | Task assignment         |
    Then the message is appended to researcher's inbox
    And the message has a unique ID and timestamp
    And a heartbeat wake is requested for the researcher session

  Scenario: Send message to non-existent teammate
    When I call send_message with recipient "unknown-teammate"
    Then the response contains error "Recipient not found"

  Scenario: Broadcast to all teammates
    Given team "project" has 3 active teammates
    When I call send_message with type "broadcast"
    Then all 3 teammates receive the message
    And each teammate's inbox is updated
    And heartbeat wake is requested for all 3 teammates

  Scenario: Message exceeds size limit
    When I call send_message with content larger than 100KB
    Then the response contains error "Message too large"
```

## What to Test

Create `tests/tools/send-message.test.ts` that:

1. Tests direct message is appended to recipient inbox
2. Tests message has correct from, to, content, summary
3. Tests message has unique ID and timestamp
4. Tests send to non-existent teammate returns error
5. Tests broadcast sends to all teammates
6. Tests message size limit enforcement
7. Tests heartbeat wake is requested
8. Uses mock mailbox and runtime

## Verification

```bash
# Run send_message tests (should FAIL initially)
cd packages/openclaw-agent-team && pnpm vitest run tests/tools/send-message.test.ts

# Expected: Tests fail because send-message.ts does not exist yet
```

## Files to Create

- `tests/tools/send-message.test.ts`

## depends-on

- [Task 012: Mailbox Module Impl](./task-012-mailbox-impl.md)
