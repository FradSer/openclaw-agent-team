# Task 002: Types Module Test

## Summary

Write failing tests for the type definitions module that define TeamConfig, TeammateDefinition, Task, and TeamMessage interfaces.

## BDD Scenario

```gherkin
Feature: Type Definitions

  Scenario: TeamConfig type validation
    Given the types module is imported
    When I create a TeamConfig object
    Then it should have id, team_name, description, agent_type, lead, metadata fields
    And metadata should include createdAt, updatedAt, status

  Scenario: TeammateDefinition type validation
    Given the types module is imported
    When I create a TeammateDefinition object
    Then it should have name, agentId, sessionKey, agentType, model, tools, status, joinedAt fields
    And status should be one of: idle, working, error, shutdown

  Scenario: Task type validation
    Given the types module is imported
    When I create a Task object
    Then it should have id, subject, description, activeForm, status, owner, blockedBy, createdAt fields
    And status should be one of: pending, in_progress, completed, failed, blocked

  Scenario: TeamMessage type validation
    Given the types module is imported
    When I create a TeamMessage object
    Then it should have id, from, to, type, content, summary, timestamp fields
    And type should be one of: message, broadcast, task_update, shutdown_request
```

## What to Test

Create `tests/types.test.ts` that:

1. Validates TeamConfig interface structure
2. Validates TeammateDefinition interface structure
3. Validates Task interface structure
4. Validates TeamMessage interface structure
5. Tests that invalid types are caught by TypeScript
6. Tests runtime validation functions if any

## Verification

```bash
# Run types tests (should FAIL initially)
cd packages/openclaw-agent-team && pnpm vitest run tests/types.test.ts

# Expected: Tests fail because types.ts does not exist yet
```

## Files to Create

- `tests/types.test.ts`

## depends-on

- [Task 001: Setup Project Structure](./task-001-setup-project-structure.md)
