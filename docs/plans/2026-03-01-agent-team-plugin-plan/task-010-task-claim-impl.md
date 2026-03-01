# Task 010: Task Claim Impl

## Summary

Implement the task_claim tool that allows teammates to claim available tasks.

## BDD Scenario

```gherkin
Feature: Task Claiming Implementation

  Scenario: task_claim tool is properly registered
    Given the task-claim module is implemented
    When I import from src/tools/task-claim.ts
    Then createTaskClaimTool function is exported
    And it returns an AnyAgentTool with:
      | label     | Task Claim       |
      | name      | task_claim       |
      | parameters | TaskClaimSchema |
```

## What to Implement

Create `src/tools/task-claim.ts` with:

1. **TaskClaimSchema** (TypeBox):
   - task_id: string (required)

2. **createTaskClaimTool(ctx)** function that returns `AnyAgentTool`:
   - label: "Task Claim"
   - name: "task_claim"
   - description: "Claims an available task for the current teammate"
   - parameters: TaskClaimSchema
   - execute: async handler that:
     - Gets task from ledger
     - Validates task exists
     - Checks task is not already claimed
     - Checks task is not completed
     - Checks task is not blocked (all blockers completed)
     - Updates task status to "in_progress"
     - Sets owner to current session key
     - Sets claimedAt timestamp
     - Returns updated task

3. **Error handling**:
   - Task not found -> not_found error
   - Task already claimed -> conflict error (with current owner)
   - Task completed -> conflict error
   - Task blocked -> conflict error (with blocking tasks)

4. **Response format**:
   ```typescript
   {
     taskId: string;
     status: "in_progress";
     owner: string;
     claimedAt: number;
   }
   ```

## Verification

```bash
# Run task_claim tests (should PASS)
cd packages/openclaw-agent-team && pnpm vitest run tests/tools/task-claim.test.ts

# Verify TypeScript compilation
cd packages/openclaw-agent-team && pnpm tsc --noEmit
```

## Files to Create

- `src/tools/task-claim.ts`

## depends-on

- [Task 010: Task Claim Test](./task-010-task-claim-test.md)
