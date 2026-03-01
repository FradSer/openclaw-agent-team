# Task 005: Team Create Test

## Summary

Write failing tests for the team_create tool that creates new teams with isolated directories.

## BDD Scenario

```gherkin
Feature: Team Creation

  Scenario: Successfully create a team
    Given no team exists with name "frontend-redesign"
    When I call team_create with:
      | team_name   | frontend-redesign |
      | description | Redesign the UI   |
    Then a team is created with ID matching regex "[a-f0-9-]{36}"
    And the team status is "active"
    And the team directory exists at ~/.openclaw/teams/frontend-redesign/
    And the response contains teamId, teamName, and status

  Scenario: Team name already exists
    Given a team "backend-api" already exists
    When I call team_create with team_name "backend-api"
    Then the response contains error "Team 'backend-api' already exists"
    And no new team directory is created

  Scenario: Invalid team name with special characters
    When I call team_create with team_name "my-team!!"
    Then the response contains error about invalid characters
    And the error message includes allowed characters pattern

  Scenario: Team name exceeds maximum length
    When I call team_create with team_name longer than 50 characters
    Then the response contains error about maximum length
```

## What to Test

Create `tests/tools/team-create.test.ts` that:

1. Tests successful team creation returns correct response
2. Tests team directory is created with correct structure
3. Tests team config is written correctly
4. Tests ledger database is initialized
5. Tests duplicate team name returns error
6. Tests invalid team name (special chars) returns error
7. Tests team name too long returns error
8. Tests empty team name returns error
9. Uses mock runtime context

## Verification

```bash
# Run team_create tests (should FAIL initially)
cd packages/openclaw-agent-team && pnpm vitest run tests/tools/team-create.test.ts

# Expected: Tests fail because team-create.ts does not exist yet
```

## Files to Create

- `tests/tools/team-create.test.ts`

## depends-on

- [Task 004: SQLite Ledger Impl](./task-004-ledger-impl.md)
