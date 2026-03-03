# Task 002: Team Shutdown Directory Deletion Implementation

## BDD Scenario

```gherkin
Feature: Team Shutdown with Directory Deletion
  As a team lead agent
  I want to shut down a team and completely remove its data
  So that all resources are cleaned up

  Scenario: Shutdown team removes directory
    Given an active team "shutdown-test"
    When I shutdown team "shutdown-test"
    Then the team directory should NOT exist
    And the response should contain:
      | status | shutdown |

  Scenario: Shutdown team cleans openclaw.json
    Given an active team "config-test" with 3 teammates
    And openclaw.json contains agents for each teammate
    And openclaw.json contains bindings for each teammate
    When I shutdown team "config-test"
    Then openclaw.json should NOT contain agents matching "teammate-config-test-*"
    And openclaw.json should NOT contain bindings matching "teammate-config-test-*"
```

## What to Implement

Modify `src/tools/team-shutdown.ts`:

1. Import `deleteTeamDirectory` from `../storage.js`
2. After successfully removing agents and bindings from config, call:
   ```typescript
   await deleteTeamDirectory(ctx.teamsDir, team_name);
   ```
3. The call should be AFTER `writeConfigFile()` succeeds
4. Directory deletion should happen even if some ledger operations fail (best effort cleanup)

## Execution Order

```
1. Validate team exists and is active
2. Get list of members from ledger
3. Collect all agentIds
4. Load openclaw.json
5. Filter out agents and bindings
6. Write updated openclaw.json (atomic)
7. Delete team directory (new step)
8. Return success response
```

## Files

| File | Action |
|------|--------|
| `src/tools/team-shutdown.ts` | Modify - add directory deletion call |

## Verification

```bash
npm test tests/tools/team-shutdown.test.ts
```

Expected: All tests should PASS (Green).

## **depends-on**

- [Task 001: deleteTeamDirectory Implementation](./task-001-delete-team-directory-impl.md)
- [Task 002: Team Shutdown Directory Test](./task-002-team-shutdown-directory-test.md)
