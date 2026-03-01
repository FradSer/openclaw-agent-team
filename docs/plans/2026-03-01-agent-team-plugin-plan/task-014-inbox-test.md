# Task 014: Inbox Test

## Summary

Write failing tests for the inbox tool that reads pending messages for the current teammate.

## BDD Scenario

```gherkin
Feature: Inbox Reading

  Scenario: Read pending messages
    Given my inbox has 3 unread messages
    When I call inbox
    Then I receive 3 messages in chronological order
    And each message has: id, from, content, summary, timestamp

  Scenario: Read and clear inbox
    Given my inbox has 2 messages
    When I call inbox with clear true
    Then I receive the 2 messages
    And my inbox file is cleared

  Scenario: Empty inbox
    Given my inbox is empty
    When I call inbox
    Then the response contains empty messages array

  Scenario: Limit message count
    Given my inbox has 10 messages
    When I call inbox with limit 5
    Then I receive the 5 most recent messages
```

## What to Test

Create `tests/tools/inbox.test.ts` that:

1. Tests reading messages returns in chronological order
2. Tests each message has required fields
3. Tests clear option removes messages after read
4. Tests empty inbox returns empty array
5. Tests limit parameter returns only N most recent
6. Tests non-teammate session returns error
7. Uses mock mailbox and session context

## Verification

```bash
# Run inbox tests (should FAIL initially)
cd packages/openclaw-agent-team && pnpm vitest run tests/tools/inbox.test.ts

# Expected: Tests fail because inbox.ts does not exist yet
```

## Files to Create

- `tests/tools/inbox.test.ts`

## depends-on

- [Task 012: Mailbox Module Impl](./task-012-mailbox-impl.md)
