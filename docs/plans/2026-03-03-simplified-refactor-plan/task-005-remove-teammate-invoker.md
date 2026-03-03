# Task 005: Remove teammate-invoker.ts

## BDD Scenario

```gherkin
Feature: Remove Teammate Invoker

  Scenario: teammate-invoker.ts is deleted
    Given the file "src/teammate-invoker.ts" exists
    When I delete "src/teammate-invoker.ts"
    Then the file should NOT exist
    And no other source files should import from it
```

## What to Delete

| File | Lines | Reason |
|------|-------|--------|
| `src/teammate-invoker.ts` | ~100 | Direct teammate invocation - use sessions_send instead |

## Files

| File | Action |
|------|--------|
| `src/teammate-invoker.ts` | Delete |

## Pre-Delete Verification

1. Search for any imports of `./teammate-invoker.js`
2. Primary importer is `src/tools/send-message.ts` (will be deleted in Task 007)

## Verification

```bash
# Verify file is deleted
ls packages/openclaw-agent-team/src/teammate-invoker.ts 2>&1 | grep -q "No such file"

# Verify no imports remain
grep -r "teammate-invoker" packages/openclaw-agent-team/src/ || echo "OK - no imports"
```

Expected: File deleted, no imports found.

## **depends-on**

- [Task 007: Remove send-message.ts](./task-007-remove-send-message.md) - primary importer, should be deleted first or in parallel
