# Task 012: Mailbox Module Test

## Summary

Write failing tests for the mailbox module that handles JSONL-based inter-agent messaging.

## BDD Scenario

```gherkin
Feature: Mailbox System

  Scenario: Send direct message
    Given teammate "researcher" exists in team "project"
    When I call sendDirectMessage with:
      | from    | lead               |
      | to      | researcher         |
      | content | Focus on the API   |
      | summary | Task assignment    |
    Then the message is appended to inbox/researcher/messages.jsonl
    And the message has a unique ID and timestamp

  Scenario: Broadcast to all teammates
    Given team "project" has 3 active teammates
    When I call broadcast with:
      | from    | lead           |
      | content | Team update    |
      | summary | Announcement   |
    Then all 3 teammates receive the message
    And each teammate's inbox is updated

  Scenario: Read pending messages
    Given my inbox has 3 unread messages
    When I call readInbox with my sessionKey
    Then I receive 3 messages in chronological order
    And each message has: id, from, content, summary, timestamp

  Scenario: Read and clear inbox
    Given my inbox has 2 messages
    When I call readInbox with clear true
    Then I receive the 2 messages
    And my inbox file is cleared

  Scenario: Message size limit
    When I call sendDirectMessage with content larger than 100KB
    Then the response contains error "Message too large"

  Scenario: Messages survive restart
    Given researcher has 2 unread messages
    When the mailbox is closed and reopened
    Then the messages are still readable

  Scenario: Messages cleared only after successful read
    Given researcher has 1 message in inbox
    When context injection fails during read
    Then the message is NOT cleared from inbox
    And the message can be re-read on next attempt
```

## What to Test

Create `tests/mailbox.test.ts` that:

1. Tests sendDirectMessage appends to correct inbox file
2. Tests broadcast writes to all teammate inboxes
3. Tests readInbox returns messages in order
4. Tests readInbox with clear removes messages
5. Tests message has unique ID and timestamp
6. Tests message size limit enforcement
7. Tests empty inbox returns empty array
8. Tests messages persist after close/reopen
9. Tests recipient not found returns error
10. Uses temp directories for isolation

## Verification

```bash
# Run mailbox tests (should FAIL initially)
cd packages/openclaw-agent-team && pnpm vitest run tests/mailbox.test.ts

# Expected: Tests fail because mailbox.ts does not exist yet
```

## Files to Create

- `tests/mailbox.test.ts`

## depends-on

- [Task 003: Storage Module Impl](./task-003-storage-impl.md)
