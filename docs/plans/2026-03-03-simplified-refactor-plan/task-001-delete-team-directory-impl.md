# Task 001: Add deleteTeamDirectory Implementation

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

Add a new function to `src/storage.ts`:

1. Create `deleteTeamDirectory(teamsDir: string, teamName: string): Promise<void>`
2. Validate team name using `TEAM_NAME_PATTERN` before constructing path
3. Use `rm(path, { recursive: true, force: true })` for atomic recursive deletion
4. The `force: true` option ensures no error if directory doesn't exist
5. Throw `TeamError` with code `INVALID_TEAM_NAME` if validation fails

## Files

| File | Action |
|------|--------|
| `src/storage.ts` | Modify - add `deleteTeamDirectory` function and export |

## Verification

```bash
npm test tests/storage/delete-team-directory.test.ts
```

Expected: Tests should PASS (Green).

## **depends-on**

- [Task 001: deleteTeamDirectory Test](./task-001-delete-team-directory-test.md)
