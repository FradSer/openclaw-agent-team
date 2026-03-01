# Task 003: Storage Module Test

## Summary

Write failing tests for the storage module that handles team directories, config files, and path resolution.

## BDD Scenario

```gherkin
Feature: Storage Module

  Scenario: Validate team name
    Given the storage module is imported
    When I call validateTeamName with "my-team-123"
    Then it returns true
    When I call validateTeamName with "my team!"
    Then it returns false
    When I call validateTeamName with a name longer than 50 characters
    Then it returns false

  Scenario: Create team directory
    Given a temp directory as teamsDir
    When I call createTeamDirectory(teamsDir, "test-team")
    Then a directory exists at teamsDir/test-team/
    And a config.json file exists inside
    And a ledger.db file exists inside
    And an inbox/ directory exists inside
    And an agents/ directory exists inside

  Scenario: Check team directory exists
    Given team "existing-team" directory exists
    When I call teamDirectoryExists(teamsDir, "existing-team")
    Then it returns true
    When I call teamDirectoryExists(teamsDir, "non-existent")
    Then it returns false

  Scenario: Write and read team config
    Given team "config-team" directory exists
    When I call writeTeamConfig with a TeamConfig object
    And I call readTeamConfig
    Then the returned config matches the written config

  Scenario: Resolve teammate paths
    Given the storage module is imported
    When I call resolveTeammatePaths(teamsDir, "my-team", "researcher")
    Then it returns:
      | workspace | teamsDir/my-team/agents/researcher/workspace |
      | agentDir  | teamsDir/my-team/agents/researcher/agent |
      | inboxPath | teamsDir/my-team/inbox/researcher/messages.jsonl |

  Scenario: Prevent path traversal
    Given the storage module is imported
    When I call resolveTeamPath with teamName "../../../etc"
    Then it throws an error about path traversal
```

## What to Test

Create `tests/storage.test.ts` that:

1. Tests `validateTeamName()` with valid and invalid names
2. Tests `createTeamDirectory()` creates correct structure
3. Tests `teamDirectoryExists()` returns correct boolean
4. Tests `writeTeamConfig()` and `readTeamConfig()` round-trip
5. Tests `resolveTeammatePaths()` returns correct paths
6. Tests path traversal prevention
7. Tests file permissions are restrictive (0o600/0o700)

## Verification

```bash
# Run storage tests (should FAIL initially)
cd packages/openclaw-agent-team && pnpm vitest run tests/storage.test.ts

# Expected: Tests fail because storage.ts does not exist yet
```

## Files to Create

- `tests/storage.test.ts`

## depends-on

- [Task 002: Types Module Impl](./task-002-types-impl.md)
