# Task 009: Task List Impl

## Summary

Implement the task_list tool that retrieves tasks from the team ledger with filtering options.

## BDD Scenario

```gherkin
Feature: Task Listing Implementation

  Scenario: task_list tool is properly registered
    Given the task-list module is implemented
    When I import from src/tools/task-list.ts
    Then createTaskListTool function is exported
    And it returns an AnyAgentTool with:
      | label     | Task List       |
      | name      | task_list       |
      | parameters | TaskListSchema |
```

## What to Implement

Create `src/tools/task-list.ts` with:

1. **TaskListSchema** (TypeBox):
   - team_name: string (required)
   - status: string enum (optional: pending, in_progress, completed, failed, blocked)
   - owner: string (optional)
   - includeCompleted: boolean (optional, default false)

2. **createTaskListTool(ctx)** function that returns `AnyAgentTool`:
   - label: "Task List"
   - name: "task_list"
   - description: "Lists tasks in the team ledger with optional filters"
   - parameters: TaskListSchema
   - execute: async handler that:
     - Validates team exists
     - Gets team ledger
     - Builds filter from parameters
     - Queries ledger.listTasks(filter)
     - Enriches tasks with blocked status
     - Returns array of tasks

3. **Task response format**:
   ```typescript
   {
     id: string;
     subject: string;
     description?: string;
     status: string;
     owner?: string;
     blockedBy: string[];
     isBlocked: boolean;
     createdAt: number;
     claimedAt?: number;
     completedAt?: number;
   }
   ```

4. **Error handling**:
   - Team not found -> not_found error

## Verification

```bash
# Run task_list tests (should PASS)
cd packages/openclaw-agent-team && pnpm vitest run tests/tools/task-list.test.ts

# Verify TypeScript compilation
cd packages/openclaw-agent-team && pnpm tsc --noEmit
```

## Files to Create

- `src/tools/task-list.ts`

## depends-on

- [Task 009: Task List Test](./task-009-task-list-test.md)
