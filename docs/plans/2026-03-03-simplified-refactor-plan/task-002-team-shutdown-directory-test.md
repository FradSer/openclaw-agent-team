# Task 002: Team Shutdown Directory Deletion Test

## BDD Scenario

```gherkin
Feature: Team Shutdown with Directory Deletion
  As a team lead agent
  I want to shut down a team and completely remove its data
  So that all resources are cleaned up

  Background:
    Given the plugin is initialized with teamsDir "/tmp/test-teams"

  Scenario: Shutdown team removes directory
    Given an active team "shutdown-test"
    When I shutdown team "shutdown-test"
    Then the team directory should NOT exist
    And the response should contain:
      | status | shutdown |

  Scenario: Shutdown team cleans openclaw.json
    Given an active team "config-test" with 3 teammates:
      | researcher |
      | coder      |
      | reviewer   |
    And openclaw.json contains agents for each teammate
    And openclaw.json contains bindings for each teammate
    When I shutdown team "config-test"
    Then openclaw.json should NOT contain agents matching "teammate-config-test-*"
    And openclaw.json should NOT contain bindings matching "teammate-config-test-*"

  Scenario: Reject shutdown of non-existent team
    Given no team exists with name "ghost-team"
    When I shutdown team "ghost-team"
    Then the response should contain error:
      | code | TEAM_NOT_FOUND |

  Scenario: Reject shutdown of already shutdown team
    Given a team "already-down" with status "shutdown"
    When I shutdown team "already-down"
    Then the response should contain error:
      | code | TEAM_ALREADY_SHUTDOWN |
```

## What to Implement

Create or update test file `tests/tools/team-shutdown.test.ts` to verify:

1. After `team_shutdown`, the team directory is completely removed from filesystem
2. All agents and bindings for the team are removed from openclaw.json
3. Proper error handling for non-existent and already-shutdown teams

## Files

| File | Action |
|------|--------|
| `tests/tools/team-shutdown.test.ts` | Modify - add directory deletion tests |

## Verification

```bash
npm test tests/tools/team-shutdown.test.ts
```

Expected: New tests should FAIL (Red) since directory deletion is not implemented yet.

## **depends-on**

None - this test extends existing team-shutdown tests.
