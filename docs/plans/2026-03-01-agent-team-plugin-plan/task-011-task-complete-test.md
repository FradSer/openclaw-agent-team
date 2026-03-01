# Task 011: Task Complete Test

## Summary

Write failing tests for the task_complete tool that allows teammates to mark tasks as completed.

## BDD Scenario

```gherkin
Feature: Task Completion

  Scenario: Complete claimed task
    Given I have claimed task "task-789"
    When I call task_complete with:
      | task_id | task-789 |
      | result  | Success  |
    Then the task status becomes "completed"
    And the completedAt timestamp is recorded
    And the result is stored

  Scenario: Complete task not owned by me
    Given task "task-other" is claimed by "worker-3"
    When I call task_complete with task_id "task-other"
    Then the response contains error "Not task owner"

  Scenario: Unblocked task becomes claimable
    Given task "task-dependent" is blocked by "task-prereq"
    When task "task-prereq" is completed
    Then task "task-dependent" is no longer blocked
    And task "task-dependent" can be claimed
```

## What to Test

Create `tests/tools/task-complete.test.ts` that:

1. Tests successful completion updates status to "completed"
2. Tests completion sets completedAt timestamp
3. Tests completion by non-owner returns error
4. Tests completion unblocks dependent tasks
5. Tests completing already completed task returns error
6. Tests completing pending (unclaimed) task returns error
7. Tests completing non-existent task returns error
8. Uses mock ledger and session context

## Verification

```bash
# Run task_complete tests (should FAIL initially)
cd packages/openclaw-agent-team && pnpm vitest run tests/tools/task-complete.test.ts

# Expected: Tests fail because task-complete.ts does not exist yet
```

## Files to Create

- `tests/tools/task-complete.test.ts`

## depends-on

- [Task 010: Task Claim Impl](./task-010-task-claim-impl.md)
