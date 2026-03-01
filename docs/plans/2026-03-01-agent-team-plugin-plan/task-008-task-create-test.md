# Task 008: Task Create Test

## Summary

Write failing tests for the task_create tool that adds tasks to the team ledger.

## BDD Scenario

```gherkin
Feature: Task Creation

  Scenario: Create task with all fields
    Given team "dev-team" exists
    When I call task_create with:
      | team_name   | dev-team              |
      | subject     | Implement auth        |
      | description | Add OAuth2 login flow |
      | activeForm  | Implementing auth     |
    Then a task is created with a unique ID
    And the task status is "pending"
    And the task appears in task_list output

  Scenario: Create task with dependencies
    Given task "task-1" exists with status "pending"
    When I call task_create with:
      | team_name | dev-team   |
      | subject   | Write tests |
      | blockedBy | task-1     |
    Then the task is created with status "pending"
    And the task shows as blocked in task_list

  Scenario: Create task with circular dependency
    Given task "task-a" depends on "task-b"
    When I call task_create for "task-b" with blockedBy "task-a"
    Then the response contains error about circular dependency

  Scenario: Create task in non-existent team
    When I call task_create with team_name "unknown-team"
    Then the response contains error "Team not found"
```

## What to Test

Create `tests/tools/task-create.test.ts` that:

1. Tests successful task creation returns task with ID
2. Tests task has correct default status "pending"
3. Tests task with blockedBy creates dependency
4. Tests task with blockedBy shows as blocked
5. Tests circular dependency detection
6. Tests task in non-existent team returns error
7. Tests task appears in ledger after creation
8. Uses mock ledger

## Verification

```bash
# Run task_create tests (should FAIL initially)
cd packages/openclaw-agent-team && pnpm vitest run tests/tools/task-create.test.ts

# Expected: Tests fail because task-create.ts does not exist yet
```

## Files to Create

- `tests/tools/task-create.test.ts`

## depends-on

- [Task 004: SQLite Ledger Impl](./task-004-ledger-impl.md)
