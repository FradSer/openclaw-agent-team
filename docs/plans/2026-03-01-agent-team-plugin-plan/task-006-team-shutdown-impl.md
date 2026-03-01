# Task 006: Team Shutdown Impl

## Summary

Implement the team_shutdown tool that gracefully terminates teams and notifies all teammates.

## BDD Scenario

```gherkin
Feature: Team Shutdown Implementation

  Scenario: team_shutdown tool is properly registered
    Given the team-shutdown module is implemented
    When I import from src/tools/team-shutdown.ts
    Then createTeamShutdownTool function is exported
    And it returns an AnyAgentTool with:
      | label     | Team Shutdown       |
      | name      | team_shutdown       |
      | parameters | TeamShutdownSchema |
```

## What to Implement

Create `src/tools/team-shutdown.ts` with:

1. **TeamShutdownSchema** (TypeBox):
   - team_name: string (required)

2. **createTeamShutdownTool(ctx)** function that returns `AnyAgentTool`:
   - label: "Team Shutdown"
   - name: "team_shutdown"
   - description: "Gracefully shuts down a team and all teammates"
   - parameters: TeamShutdownSchema
   - execute: async handler that:
     - Validates team exists
     - Checks current status
     - Sends shutdown_request to all teammates via mailbox
     - Updates team config status to "shutdown"
     - Removes teammate agents from global config
     - Closes ledger connection
     - Returns shutdown confirmation

3. **Error handling**:
   - Team not found -> not_found error
   - Already shutdown -> warning (not error)
   - Message delivery failure -> logged but continues

4. **Response format**:
   ```typescript
   {
     teamName: string;
     status: "shutdown";
     teammatesNotified: number;
   }
   ```

## Verification

```bash
# Run team_shutdown tests (should PASS)
cd packages/openclaw-agent-team && pnpm vitest run tests/tools/team-shutdown.test.ts

# Verify TypeScript compilation
cd packages/openclaw-agent-team && pnpm tsc --noEmit
```

## Files to Create

- `src/tools/team-shutdown.ts`

## depends-on

- [Task 006: Team Shutdown Test](./task-006-team-shutdown-test.md)
