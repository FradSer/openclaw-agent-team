# Task 003: Remove mailbox.ts

## BDD Scenario

```gherkin
Feature: Remove Duplicate Messaging Infrastructure

  Scenario: mailbox.ts is deleted
    Given the file "src/mailbox.ts" exists
    When I delete "src/mailbox.ts"
    Then the file should NOT exist
    And no other source files should import from it
```

## What to Delete

| File | Lines | Reason |
|------|-------|--------|
| `src/mailbox.ts` | ~180 | Messaging removed - use core's sessions_send |

## Files

| File | Action |
|------|--------|
| `src/mailbox.ts` | Delete |

## Pre-Delete Verification

1. Search for any imports of `./mailbox.js` or `../mailbox.js`
2. If imports found, this task should FAIL - dependencies must be removed first

## Verification

```bash
# Verify file is deleted
ls packages/openclaw-agent-team/src/mailbox.ts 2>&1 | grep -q "No such file"

# Verify no imports remain
grep -r "from.*mailbox" packages/openclaw-agent-team/src/ || echo "OK - no imports"

# Build should still succeed
npm run build
```

Expected: File deleted, no imports found, build succeeds.

## **depends-on**

- [Task 007: Remove send-message.ts](./task-007-remove-send-message.md) - imports from mailbox
- [Task 008: Remove inbox.ts](./task-008-remove-inbox.md) - imports from mailbox

Importing files must be deleted before the imported file.
