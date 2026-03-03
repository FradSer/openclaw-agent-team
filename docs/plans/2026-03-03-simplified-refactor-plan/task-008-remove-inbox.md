# Task 008: Remove inbox.ts

## BDD Scenario

```gherkin
Feature: Remove Messaging Tools

  Scenario: inbox.ts is deleted
    Given the file "src/tools/inbox.ts" exists
    And it exports createInboxTool
    When I delete "src/tools/inbox.ts"
    Then the file should NOT exist
    And no other source files should import from it
```

## What to Delete

| File | Lines | Reason |
|------|-------|--------|
| `src/tools/inbox.ts` | ~115 | Inbox tool - use core's sessions_history instead |

## Files

| File | Action |
|------|--------|
| `src/tools/inbox.ts` | Delete |

## Pre-Delete Verification

1. Search for imports: `grep -r "inbox" src/`
2. Primary importer is `src/index.ts` - will be cleaned in Task 010

## Verification

```bash
# Verify file is deleted
ls packages/openclaw-agent-team/src/tools/inbox.ts 2>&1 | grep -q "No such file"

# Verify no imports remain
grep -r "from.*inbox" packages/openclaw-agent-team/src/ || echo "OK - no imports"

# Build may fail until Task 010 cleans index.ts
npm run build || echo "Expected - index.ts cleanup in Task 010"
```

Expected: File deleted. Build may fail until Task 010.

## **depends-on**

None - can run in parallel with other file deletions. index.ts cleanup happens in Task 010.
