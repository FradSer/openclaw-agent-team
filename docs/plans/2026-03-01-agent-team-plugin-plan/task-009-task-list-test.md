# Task 009: Task List Test

## Summary

Write failing tests for the task_list tool that retrieves tasks from the team ledger with filtering.

## BDD Scenario

```gherkin
Feature: Task Listing

  Scenario: List all tasks
    Given team "project" has 5 tasks
    When I call task_list with team_name "project"
    Then the response contains 5 tasks
    And each task has: id, subject, status, owner, blocked status

  Scenario: Filter tasks by status
    Given team "project" has 3 pending and 2 completed tasks
    When I call task_list with status "pending"
    Then the response contains 3 tasks
    And all tasks have status "pending"

  Scenario: Filter tasks by owner
    Given teammate "worker-1" has claimed 2 tasks
    When I call task_list with owner "worker-1"
    Then the response contains 2 tasks
    And all tasks are owned by "worker-1"

  Scenario: Include completed tasks
    Given team "project" has 10 completed tasks
    When I call task_list with includeCompleted true
    Then the response contains completed tasks
    And completed tasks show completion time
```

## What to Test

Create `tests/tools/task-list.test.ts` that:

1. Tests listing all tasks returns correct count
2. Tests each task has required fields
3. Tests filtering by status returns only matching tasks
4. Tests filtering by owner returns only matching tasks
5. Tests includeCompleted flag includes completed tasks
6. Tests blocked status is included in response
7. Tests empty team returns empty array
8. Tests non-existent team returns error
9. Uses mock ledger with test data

## Verification

```bash
# Run task_list tests (should FAIL initially)
cd packages/openclaw-agent-team && pnpm vitest run tests/tools/task-list.test.ts

# Expected: Tests fail because task-list.ts does not exist yet
```

## Files to Create

- `tests/tools/task-list.test.ts`

## depends-on

- [Task 008: Task Create Impl](./task-008-task-create-impl.md)
