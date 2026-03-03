# Task 001: Add deleteTeamDirectory Test

## BDD Scenario

```gherkin
Feature: Team Shutdown with Directory Deletion

  Scenario: Delete team directory removes all contents
    Given a team directory exists at "/tmp/test-teams/my-team/"
    And the directory contains config.json, ledger.db, and agents/
    When I call deleteTeamDirectory("/tmp/test-teams", "my-team")
    Then the directory "/tmp/test-teams/my-team/" should NOT exist

  Scenario: Delete non-existent directory succeeds gracefully
    Given no directory exists at "/tmp/test-teams/ghost-team/"
    When I call deleteTeamDirectory("/tmp/test-teams", "ghost-team")
    Then the operation should succeed without error

  Scenario: Delete rejects path traversal attempts
    Given a teamsDir "/tmp/test-teams"
    When I call deleteTeamDirectory("/tmp/test-teams", "../escape")
    Then the operation should fail with:
      | code | INVALID_TEAM_NAME |
```

## What to Implement

Create a test file `tests/storage/delete-team-directory.test.ts` that verifies:

1. `deleteTeamDirectory(teamsDir, teamName)` deletes the entire team directory recursively
2. Gracefully handles non-existent directories (no error thrown)
3. Validates team name to prevent path traversal attacks

## Files

| File | Action |
|------|--------|
| `tests/storage/delete-team-directory.test.ts` | Create |

## Verification

```bash
npm test tests/storage/delete-team-directory.test.ts
```

Expected: Tests should FAIL (Red) since `deleteTeamDirectory` does not exist yet.

## **depends-on**

None - this is a standalone test for new functionality.
