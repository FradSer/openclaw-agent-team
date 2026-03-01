# Task 004: SQLite Ledger Test

## Summary

Write failing tests for the SQLite ledger module that handles task persistence, member tracking, and dependency management.

## BDD Scenario

```gherkin
Feature: SQLite Ledger

  Scenario: Create task with generated ID
    Given a TeamLedger instance with temp database
    When I call createTask with subject "Test task" and description "Description"
    Then a task is returned with a UUID id
    And the task status is "pending"
    And createdAt timestamp is set

  Scenario: Create task with dependencies
    Given task "task-1" exists
    When I call createTask with blockedBy ["task-1"]
    Then the task is created
    And isTaskBlocked returns true for the new task
    And getBlockingTasks returns ["task-1"]

  Scenario: List tasks with filters
    Given 3 pending tasks and 2 completed tasks exist
    When I call listTasks with status "pending"
    Then 3 tasks are returned
    And all have status "pending"

  Scenario: Update task status
    Given task "task-123" exists with status "pending"
    When I call updateTaskStatus("task-123", "in_progress", "owner-1")
    Then the task status is "in_progress"
    And the task owner is "owner-1"

  Scenario: Add and list members
    Given a TeamLedger instance
    When I call addMember with a TeammateDefinition
    And I call listMembers
    Then the member appears in the list

  Scenario: Detect circular dependencies
    Given task "task-a" depends on "task-b"
    When I call createTask for "task-b" with blockedBy ["task-a"]
    Then an error is thrown about circular dependency

  Scenario: Get dependent tasks
    Given task "task-1" is blocked by "task-2"
    When I call getDependentTasks("task-2")
    Then ["task-1"] is returned
```

## What to Test

Create `tests/ledger.test.ts` that:

1. Tests `TeamLedger` constructor initializes database
2. Tests `createTask()` generates UUID and sets defaults
3. Tests `createTask()` with blockedBy creates dependency
4. Tests `getTask()` retrieves by ID
5. Tests `listTasks()` with status filter
6. Tests `listTasks()` with owner filter
7. Tests `updateTaskStatus()` transitions correctly
8. Tests `deleteTask()` removes task
9. Tests `addMember()` and `listMembers()`
10. Tests `updateMemberStatus()` and `removeMember()`
11. Tests `isTaskBlocked()` checks dependencies
12. Tests `getBlockingTasks()` returns blockers
13. Tests `getDependentTasks()` returns dependents
14. Tests circular dependency detection
15. Tests WAL mode is enabled

## Verification

```bash
# Run ledger tests (should FAIL initially)
cd packages/openclaw-agent-team && pnpm vitest run tests/ledger.test.ts

# Expected: Tests fail because ledger.ts does not exist yet
```

## Files to Create

- `tests/ledger.test.ts`

## depends-on

- [Task 003: Storage Module Impl](./task-003-storage-impl.md)
