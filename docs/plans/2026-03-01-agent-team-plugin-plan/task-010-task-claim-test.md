# Task 010: Task Claim Test

## Summary

Write failing tests for the task_claim tool that allows teammates to claim available tasks.

## BDD Scenario

```gherkin
Feature: Task Claiming

  Scenario: Claim available task
    Given task "task-123" exists with status "pending"
    And I am teammate "worker-1"
    When I call task_claim with task_id "task-123"
    Then the task status becomes "in_progress"
    And the task owner is set to my session key
    And the claimedAt timestamp is recorded

  Scenario: Claim task already claimed by another
    Given task "task-456" is claimed by "worker-2"
    When I call task_claim with task_id "task-456"
    Then the response contains error "Task already claimed"
    And the current owner is indicated

  Scenario: Claim blocked task
    Given task "task-blocked" has blockedBy "task-unfinished"
    And task "task-unfinished" status is "pending"
    When I call task_claim with task_id "task-blocked"
    Then the response contains error "Task is blocked"
    And the blocking tasks are listed
```

## What to Test

Create `tests/tools/task-claim.test.ts` that:

1. Tests successful claim updates status to "in_progress"
2. Tests claim sets owner to session key
3. Tests claim sets claimedAt timestamp
4. Tests claiming already claimed task returns error
5. Tests claiming blocked task returns error with blocking tasks
6. Tests claiming completed task returns error
7. Tests claiming non-existent task returns error
8. Uses mock ledger and session context

## Verification

```bash
# Run task_claim tests (should FAIL initially)
cd packages/openclaw-agent-team && pnpm vitest run tests/tools/task-claim.test.ts

# Expected: Tests fail because task-claim.ts does not exist yet
```

## Files to Create

- `tests/tools/task-claim.test.ts`

## depends-on

- [Task 009: Task List Impl](./task-009-task-list-impl.md)
