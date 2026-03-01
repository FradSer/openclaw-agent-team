# Task 008: Task Create Impl

## Summary

Implement the task_create tool that adds tasks to the team ledger with dependency support.

## BDD Scenario

```gherkin
Feature: Task Creation Implementation

  Scenario: task_create tool is properly registered
    Given the task-create module is implemented
    When I import from src/tools/task-create.ts
    Then createTaskCreateTool function is exported
    And it returns an AnyAgentTool with:
      | label     | Task Create       |
      | name      | task_create       |
      | parameters | TaskCreateSchema |
```

## What to Implement

Create `src/tools/task-create.ts` with:

1. **TaskCreateSchema** (TypeBox):
   - team_name: string (required)
   - subject: string (required)
   - description: string (optional)
   - activeForm: string (optional)
   - blockedBy: array of strings (optional)

2. **createTaskCreateTool(ctx)** function that returns `AnyAgentTool`:
   - label: "Task Create"
   - name: "task_create"
   - description: "Creates a new task in the team ledger"
   - parameters: TaskCreateSchema
   - execute: async handler that:
     - Validates team exists
     - Gets team ledger
     - Checks for circular dependencies if blockedBy provided
     - Creates task via ledger.createTask()
     - Returns { taskId, subject, status }

3. **Error handling**:
   - Team not found -> not_found error
   - Circular dependency -> validation error
   - Blocking task not found -> validation error

4. **Response format**:
   ```typescript
   {
     taskId: string;
     subject: string;
     status: "pending";
     blockedBy?: string[];
   }
   ```

## Verification

```bash
# Run task_create tests (should PASS)
cd packages/openclaw-agent-team && pnpm vitest run tests/tools/task-create.test.ts

# Verify TypeScript compilation
cd packages/openclaw-agent-team && pnpm tsc --noEmit
```

## Files to Create

- `src/tools/task-create.ts`

## depends-on

- [Task 008: Task Create Test](./task-008-task-create-test.md)
