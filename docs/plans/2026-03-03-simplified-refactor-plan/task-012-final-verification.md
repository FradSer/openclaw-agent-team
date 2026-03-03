# Task 012: Final Verification

## BDD Scenario

```gherkin
Feature: Final Verification

  Scenario: All tests pass and refactor is complete
    Given all previous tasks are completed
    When I run the full test suite
    Then all tests should pass
    And the build should succeed
    And no messaging-related code should remain in src/

  Scenario: Code size reduction achieved
    Given the refactor is complete
    When I count lines of code in src/
    Then the code size should be reduced by approximately 40%

  Scenario: Team shutdown deletes directory
    Given an active team "verification-team"
    When I shutdown team "verification-team"
    Then the team directory should NOT exist
    And openclaw.json should NOT contain agents for the team
```

## Verification Checklist

### 1. Build Verification

```bash
npm run build
```

Expected: Build succeeds without errors.

### 2. Test Verification

```bash
npm test
```

Expected: All tests pass.

### 3. No Messaging Code

```bash
# Verify no messaging files remain
ls packages/openclaw-agent-team/src/mailbox.ts 2>&1 | grep -q "No such file" && echo "OK"
ls packages/openclaw-agent-team/src/context-injection.ts 2>&1 | grep -q "No such file" && echo "OK"
ls packages/openclaw-agent-team/src/teammate-invoker.ts 2>&1 | grep -q "No such file" && echo "OK"
ls packages/openclaw-agent-team/src/reply-dispatcher.ts 2>&1 | grep -q "No such file" && echo "OK"
ls packages/openclaw-agent-team/src/tools/send-message.ts 2>&1 | grep -q "No such file" && echo "OK"
ls packages/openclaw-agent-team/src/tools/inbox.ts 2>&1 | grep -q "No such file" && echo "OK"

# Verify no messaging imports in remaining files
grep -r "mailbox\|context-injection\|teammate-invoker\|reply-dispatcher\|send-message\|inbox" packages/openclaw-agent-team/src/ || echo "OK - no messaging imports"
```

Expected: All messaging files deleted, no imports remain.

### 4. Tool Count Verification

```bash
# Verify exactly 7 tools registered
grep -c "registerTool" packages/openclaw-agent-team/src/index.ts
```

Expected: 7 tools (team_create, team_shutdown, teammate_spawn, task_create, task_list, task_claim, task_complete).

### 5. Team Shutdown Integration Test

```bash
npm test tests/tools/team-shutdown.test.ts
```

Expected: Tests pass, including directory deletion verification.

### 6. Code Size Reduction

```bash
# Count lines in src/ (rough estimate)
find packages/openclaw-agent-team/src -name "*.ts" -exec wc -l {} + | tail -1
```

Expected: Approximately 1100 lines (down from ~1835, ~40% reduction).

## Files

No files to modify - this is a verification task.

## **depends-on**

- [Task 001: deleteTeamDirectory Test](./task-001-delete-team-directory-test.md)
- [Task 001: deleteTeamDirectory Impl](./task-001-delete-team-directory-impl.md)
- [Task 002: Team Shutdown Directory Test](./task-002-team-shutdown-directory-test.md)
- [Task 002: Team Shutdown Directory Impl](./task-002-team-shutdown-directory-impl.md)
- [Task 003: Remove mailbox.ts](./task-003-remove-mailbox.md)
- [Task 004: Remove context-injection.ts](./task-004-remove-context-injection.md)
- [Task 005: Remove teammate-invoker.ts](./task-005-remove-teammate-invoker.md)
- [Task 006: Remove reply-dispatcher.ts](./task-006-remove-reply-dispatcher.md)
- [Task 007: Remove send-message.ts](./task-007-remove-send-message.md)
- [Task 008: Remove inbox.ts](./task-008-remove-inbox.md)
- [Task 009: Remove message types](./task-009-remove-message-types.md)
- [Task 010: Update index.ts](./task-010-update-index.md)
- [Task 011: Delete test files](./task-011-delete-test-files.md)

All implementation tasks must be completed before final verification.
