# Task 006: Remove reply-dispatcher.ts

## BDD Scenario

```gherkin
Feature: Remove Reply Dispatcher

  Scenario: reply-dispatcher.ts is deleted
    Given the file "src/reply-dispatcher.ts" exists
    When I delete "src/reply-dispatcher.ts"
    Then the file should NOT exist
    And no other source files should import from it
```

## What to Delete

| File | Lines | Reason |
|------|-------|--------|
| `src/reply-dispatcher.ts` | ~65 | Reply dispatch - channel handles routing now |

## Files

| File | Action |
|------|--------|
| `src/reply-dispatcher.ts` | Delete |

## Pre-Delete Verification

1. Search for imports: `grep -r "reply-dispatcher" src/`
2. Primary importer is `src/teammate-invoker.ts` (deleted in Task 005)

## Verification

```bash
# Verify file is deleted
ls packages/openclaw-agent-team/src/reply-dispatcher.ts 2>&1 | grep -q "No such file"

# Verify no imports remain
grep -r "reply-dispatcher" packages/openclaw-agent-team/src/ || echo "OK - no imports"

# Build should still succeed
npm run build
```

Expected: File deleted, no imports found, build succeeds.

## **depends-on**

- [Task 005: Remove teammate-invoker.ts](./task-005-remove-teammate-invoker.md) - primary importer
