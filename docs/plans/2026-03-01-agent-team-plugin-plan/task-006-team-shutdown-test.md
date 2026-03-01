# Task 006: Team Shutdown Test

## Summary

Write failing tests for the team_shutdown tool that gracefully terminates teams and their teammates.

## BDD Scenario

```gherkin
Feature: Team Shutdown

  Scenario: Shutdown active team with teammates
    Given team "project-alpha" exists with 3 active teammates
    When I call team_shutdown with team_name "project-alpha"
    Then all 3 teammates receive shutdown_request messages
    And all teammate processes are terminated
    And the team status becomes "shutdown"
    And the response contains shutdown confirmation

  Scenario: Shutdown non-existent team
    Given no team exists with name "unknown-team"
    When I call team_shutdown with team_name "unknown-team"
    Then the response contains error "Team 'unknown-team' not found"

  Scenario: Shutdown already shutdown team
    Given team "completed-project" has status "shutdown"
    When I call team_shutdown with team_name "completed-project"
    Then the response contains warning "Team already shutdown"
```

## What to Test

Create `tests/tools/team-shutdown.test.ts` that:

1. Tests successful shutdown updates team status
2. Tests shutdown sends messages to all teammates
3. Tests shutdown removes agents from config
4. Tests shutdown of non-existent team returns error
5. Tests shutdown of already shutdown team returns warning
6. Tests shutdown cleans up resources
7. Uses mock runtime context and mailbox

## Verification

```bash
# Run team_shutdown tests (should FAIL initially)
cd packages/openclaw-agent-team && pnpm vitest run tests/tools/team-shutdown.test.ts

# Expected: Tests fail because team-shutdown.ts does not exist yet
```

## Files to Create

- `tests/tools/team-shutdown.test.ts`

## depends-on

- [Task 005: Team Create Impl](./task-005-team-create-impl.md)
