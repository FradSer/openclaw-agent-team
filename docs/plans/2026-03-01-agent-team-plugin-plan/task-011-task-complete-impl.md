# Task 011: Task Complete Impl

## Summary

Implement the task_complete tool that allows teammates to mark tasks as completed and unblock dependents.

## BDD Scenario

```gherkin
Feature: Task Completion Implementation

  Scenario: task_complete tool is properly registered
    Given the task-complete module is implemented
    When I import from src/tools/task-complete.ts
    Then createTaskCompleteTool function is exported
    And it returns an AnyAgentTool with:
      | label     | Task Complete       |
      | name      | task_complete       |
      | parameters | TaskCompleteSchema |
```

## What to Implement

Create `src/tools/task-complete.ts` with:

1. **TaskCompleteSchema** (TypeBox):
   - task_id: string (required)
   - result: string (optional, result/notes)

2. **createTaskCompleteTool(ctx)** function that returns `AnyAgentTool`:
   - label: "Task Complete"
   - name: "task_complete"
   - description: "Marks a claimed task as completed"
   - parameters: TaskCompleteSchema
   - execute: async handler that:
     - Gets task from ledger
     - Validates task exists
     - Validates current session is task owner
     - Validates task is in "in_progress" status
     - Updates task status to "completed"
     - Sets completedAt timestamp
     - Stores result if provided
     - Returns updated task

3. **Error handling**:
   - Task not found -> not_found error
   - Not task owner -> forbidden error
   - Task not in progress -> conflict error

4. **Response format**:
   ```typescript
   {
     taskId: string;
     status: "completed";
     completedAt: number;
     result?: string;
   }
   ```

## Verification

```bash
# Run task_complete tests (should PASS)
cd packages/openclaw-agent-team && pnpm vitest run tests/tools/task-complete.test.ts

# Verify TypeScript compilation
cd packages/openclaw-agent-team && pnpm tsc --noEmit
```

## Files to Create

- `src/tools/task-complete.ts`

## depends-on

- [Task 011: Task Complete Test](./task-011-task-complete-test.md)
