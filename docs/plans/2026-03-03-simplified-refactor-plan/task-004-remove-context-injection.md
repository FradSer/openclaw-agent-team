# Task 004: Remove context-injection.ts

## BDD Scenario

```gherkin
Feature: Remove Context Injection Hook

  Scenario: context-injection.ts is deleted
    Given the file "src/context-injection.ts" exists
    And it exports createContextInjectionHook
    When I delete "src/context-injection.ts"
    Then the file should NOT exist
    And no other source files should import from it
```

## What to Delete

| File | Lines | Reason |
|------|-------|--------|
| `src/context-injection.ts` | ~80 | Hook for message injection - no longer needed |

## Files

| File | Action |
|------|--------|
| `src/context-injection.ts` | Delete |

## Pre-Delete Verification

1. Search for imports: `grep -r "context-injection" src/`
2. Primary importer is `src/index.ts` - will be cleaned in Task 010

## Verification

```bash
# Verify file is deleted
ls packages/openclaw-agent-team/src/context-injection.ts 2>&1 | grep -q "No such file"

# Verify no imports remain
grep -r "context-injection" packages/openclaw-agent-team/src/ || echo "OK"

# Build should still succeed (index.ts still references it, so expect error)
npm run build || echo "Expected - index.ts cleanup in Task 010"
```

Expected: File deleted. Build may fail until Task 010.

## **depends-on**

None - context-injection.ts is only imported by index.ts, which is cleaned in Task 010.
