# Task 011: Delete messaging test files

## BDD Scenario

```gherkin
Feature: Clean Up Test Files

  Scenario: Messaging-related test files are deleted
    Given the following test files exist:
      | tests/mailbox.test.ts              |
      | tests/context-injection.test.ts    |
      | tests/tools/send-message.test.ts   |
      | tests/tools/inbox.test.ts          |
    When I delete all messaging test files
    Then the files should NOT exist
    And the test suite should still run successfully
```

## What to Delete

| File | Reason |
|------|--------|
| `tests/mailbox.test.ts` | Tests for deleted mailbox.ts |
| `tests/context-injection.test.ts` | Tests for deleted context-injection.ts |
| `tests/tools/send-message.test.ts` | Tests for deleted send-message.ts |
| `tests/tools/inbox.test.ts` | Tests for deleted inbox.ts |

## Files

| File | Action |
|------|--------|
| `tests/mailbox.test.ts` | Delete |
| `tests/context-injection.test.ts` | Delete |
| `tests/tools/send-message.test.ts` | Delete |
| `tests/tools/inbox.test.ts` | Delete |

## Verification

```bash
# Verify test files are deleted
ls tests/mailbox.test.ts 2>&1 | grep -q "No such file" && echo "OK: mailbox.test.ts deleted"
ls tests/context-injection.test.ts 2>&1 | grep -q "No such file" && echo "OK: context-injection.test.ts deleted"
ls tests/tools/send-message.test.ts 2>&1 | grep -q "No such file" && echo "OK: send-message.test.ts deleted"
ls tests/tools/inbox.test.ts 2>&1 | grep -q "No such file" && echo "OK: inbox.test.ts deleted"

# Run remaining tests
npm test
```

Expected: All 4 test files deleted, remaining tests pass.

## **depends-on**

- [Task 003: Remove mailbox.ts](./task-003-remove-mailbox.md)
- [Task 004: Remove context-injection.ts](./task-004-remove-context-injection.md)
- [Task 007: Remove send-message.ts](./task-007-remove-send-message.md)
- [Task 008: Remove inbox.ts](./task-008-remove-inbox.md)

Source files must be deleted first since tests depend on them.
