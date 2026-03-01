# Task 007: Teammate Spawn Test

## Summary

Write failing tests for the teammate_spawn tool that creates full agent instances with isolated workspaces.

## BDD Scenario

```gherkin
Feature: Teammate Spawning

  Scenario: Spawn teammate with full agent
    Given team "research-project" exists and is active
    When I call teammate_spawn with:
      | team_name  | research-project |
      | name       | researcher       |
      | agent_type | Explore          |
      | model      | claude-sonnet-4  |
    Then a new agent entry is added to agents.list
    And the agent ID is "teammate-research-project-researcher"
    And the workspace is created at ~/.openclaw/teams/research-project/agents/researcher/workspace/
    And the agentDir is created at ~/.openclaw/teams/research-project/agents/researcher/agent/
    And the teammate is added to the team ledger

  Scenario: Spawn teammate with tool restrictions
    When I call teammate_spawn with:
      | team_name | dev-team     |
      | name      | code-reviewer |
      | tools     | read, grep, task_complete |
    Then the teammate can only use read, grep, and task_complete tools
    And other tools return permission denied

  Scenario: Spawn teammate when team at capacity
    Given team "full-team" has 10 teammates (maxTeammatesPerTeam)
    When I call teammate_spawn with team_name "full-team"
    Then the response contains error "Team has reached maximum teammates"

  Scenario: Spawn teammate with invalid name
    When I call teammate_spawn with name "test!!"
    Then the response contains error about invalid name format

  Scenario: Spawn teammate in shutdown team
    Given team "shutdown-team" has status "shutdown"
    When I call teammate_spawn with team_name "shutdown-team"
    Then the response contains error "Team is not active"
```

## What to Test

Create `tests/tools/teammate-spawn.test.ts` that:

1. Tests successful spawn creates agent config entry
2. Tests workspace and agentDir directories are created
3. Tests teammate is added to ledger
4. Tests agent ID format is correct
5. Tests tool restrictions are applied
6. Tests max teammates limit is enforced
7. Tests invalid name returns error
8. Tests spawn in shutdown team returns error
9. Tests spawn in non-existent team returns error
10. Uses mock runtime with config.writeConfigFile

## Verification

```bash
# Run teammate_spawn tests (should FAIL initially)
cd packages/openclaw-agent-team && pnpm vitest run tests/tools/teammate-spawn.test.ts

# Expected: Tests fail because teammate-spawn.ts does not exist yet
```

## Files to Create

- `tests/tools/teammate-spawn.test.ts`

## depends-on

- [Task 005: Team Create Impl](./task-005-team-create-impl.md)
