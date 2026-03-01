# Task 004: SQLite Ledger Impl

## Summary

Implement the SQLite ledger module for task persistence, member tracking, and dependency management with WAL mode.

## BDD Scenario

```gherkin
Feature: SQLite Ledger Implementation

  Scenario: All ledger methods work correctly
    Given the ledger module is implemented
    When I use TeamLedger class
    Then createTask creates tasks with UUIDs
    And getTask retrieves tasks by ID
    And listTasks filters by status and owner
    And updateTaskStatus updates status and owner
    And deleteTask removes tasks
    And addMember/listMembers manage teammates
    And dependency methods work correctly
```

## What to Implement

Create `src/ledger.ts` with:

1. **TeamLedger class** with constructor that:
   - Opens SQLite database
   - Enables WAL mode
   - Creates tables if not exist

2. **Database Schema**:
   ```sql
   CREATE TABLE tasks (
     id TEXT PRIMARY KEY,
     subject TEXT NOT NULL,
     description TEXT,
     active_form TEXT,
     status TEXT NOT NULL DEFAULT 'pending',
     owner TEXT,
     created_at INTEGER NOT NULL,
     claimed_at INTEGER,
     completed_at INTEGER
   );

   CREATE TABLE task_dependencies (
     task_id TEXT NOT NULL,
     blocks_task_id TEXT NOT NULL,
     PRIMARY KEY (task_id, blocks_task_id)
   );

   CREATE TABLE members (
     session_key TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     agent_id TEXT NOT NULL,
     agent_type TEXT,
     status TEXT NOT NULL DEFAULT 'idle',
     joined_at INTEGER NOT NULL
   );

   CREATE INDEX idx_tasks_status ON tasks(status);
   CREATE INDEX idx_tasks_owner ON tasks(owner);
   ```

3. **Task operations**:
   - `createTask(task): Task` - Insert with UUID, check circular deps
   - `getTask(taskId): Task | null` - Select by ID
   - `listTasks(filter?): Task[]` - Select with optional filters
   - `updateTaskStatus(taskId, status, owner?): boolean`
   - `deleteTask(taskId): boolean`

4. **Member operations**:
   - `addMember(member): void`
   - `listMembers(): TeammateDefinition[]`
   - `updateMemberStatus(sessionKey, status): boolean`
   - `removeMember(sessionKey): boolean`

5. **Dependency operations**:
   - `getBlockingTasks(taskId): Task[]` - Tasks blocking this one
   - `getDependentTasks(taskId): Task[]` - Tasks depending on this one
   - `isTaskBlocked(taskId): boolean`

6. **Cleanup**:
   - `close(): void` - Close database connection

7. **Use prepared statements** for all queries

8. **Use transactions** for batch operations

## Verification

```bash
# Run ledger tests (should PASS)
cd packages/openclaw-agent-team && pnpm vitest run tests/ledger.test.ts

# Verify TypeScript compilation
cd packages/openclaw-agent-team && pnpm tsc --noEmit
```

## Files to Create

- `src/ledger.ts`

## depends-on

- [Task 004: SQLite Ledger Test](./task-004-ledger-test.md)
