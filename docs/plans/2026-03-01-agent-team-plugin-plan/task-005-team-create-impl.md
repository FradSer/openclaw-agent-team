# Task 005: Team Create Impl

## Summary

Implement the team_create tool that creates new teams with isolated directories, config files, and ledger database.

## BDD Scenario

```gherkin
Feature: Team Creation Implementation

  Scenario: team_create tool is properly registered
    Given the team-create module is implemented
    When I import from src/tools/team-create.ts
    Then createTeamCreateTool function is exported
    And it returns an AnyAgentTool with:
      | label     | Team Create         |
      | name      | team_create         |
      | parameters | TeamCreateSchema   |
```

## What to Implement

Create `src/tools/team-create.ts` with:

1. **TeamCreateSchema** (TypeBox):
   - team_name: string (required, 1-50 chars, pattern)
   - description: string (optional)
   - agent_type: string (optional, default "team-lead")

2. **createTeamCreateTool(ctx)** function that returns `AnyAgentTool`:
   - label: "Team Create"
   - name: "team_create"
   - description: "Creates a new team with isolated storage"
   - parameters: TeamCreateSchema
   - execute: async handler that:
     - Validates team_name format
     - Checks team doesn't already exist
     - Creates team directory structure
     - Writes team config
     - Initializes ledger database
     - Returns { teamId, teamName, status }

3. **Error handling**:
   - Invalid team name -> validation error
   - Team exists -> conflict error
   - File system errors -> system error

4. **Response format**:
   ```typescript
   {
     teamId: string;      // UUID
     teamName: string;
     status: "active";
   }
   ```

## Verification

```bash
# Run team_create tests (should PASS)
cd packages/openclaw-agent-team && pnpm vitest run tests/tools/team-create.test.ts

# Verify TypeScript compilation
cd packages/openclaw-agent-team && pnpm tsc --noEmit
```

## Files to Create

- `src/tools/team-create.ts`

## depends-on

- [Task 005: Team Create Test](./task-005-team-create-test.md)
