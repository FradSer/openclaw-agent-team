# Task 007: Remove send-message.ts

## BDD Scenario

```gherkin
Feature: Remove Messaging Tools

  Scenario: send-message.ts is deleted
    Given the file "src/tools/send-message.ts" exists
    And it exports createSendMessageTool
    When I delete "src/tools/send-message.ts"
    Then the file should NOT exist
    And no other source files should import from it
```

## What to Delete

| File | Lines | Reason |
|------|-------|--------|
| `src/tools/send-message.ts` | ~195 | Messaging tool - use core's sessions_send instead |

## Files

| File | Action |
|------|--------|
| `src/tools/send-message.ts` | Delete |

## Pre-Delete Verification

1. Search for imports: `grep -r "send-message" src/`
2. Primary importer is `src/index.ts` - will be cleaned in Task 010

## Verification

```bash
# Verify file is deleted
ls packages/openclaw-agent-team/src/tools/send-message.ts 2>&1 | grep -q "No such file"

# Verify no imports remain
grep -r "send-message" packages/openclaw-agent-team/src/ || echo "OK - no imports"

# Build may fail until Task 010 cleans index.ts
npm run build || echo "Expected - index.ts cleanup in Task 010"
```

Expected: File deleted. Build may fail until Task 010.

## **depends-on**

None - can run in parallel with other file deletions. index.ts cleanup happens in Task 010.
