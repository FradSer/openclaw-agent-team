# BDD Specifications

## Overview

This document provides Gherkin-style BDD specifications for the simplified openclaw-agent-team plugin refactor.

---

## 1. Team Lifecycle

### Feature: Team Creation

```gherkin
Feature: Team Creation
  As a team lead agent
  I want to create a new team with isolated storage
  So that I can coordinate multiple agents on complex tasks

  Background:
    Given the plugin is initialized with teamsDir "/tmp/test-teams"

  Scenario: Create team with minimal parameters
    Given no team exists with name "my-project"
    When I create a team with:
      | team_name | my-project |
    Then the response should contain:
      | teamId    | <UUID>     |
      | teamName  | my-project |
      | status    | active     |
    And a directory should exist at "/tmp/test-teams/my-project/"
    And config.json should contain:
      | team_name | my-project |
      | status    | active     |

  Scenario: Create team with description
    Given no team exists with name "documented-team"
    When I create a team with:
      | team_name   | documented-team  |
      | description | A team with docs |
    Then config.json should contain:
      | description | A team with docs |

  Scenario: Reject duplicate team name
    Given a team exists with name "existing-team"
    When I create a team with:
      | team_name | existing-team |
    Then the response should contain error:
      | code | TEAM_ALREADY_EXISTS |

  Scenario: Reject invalid team name
    When I create a team with:
      | team_name | ../escape |
    Then the response should contain error:
      | code | INVALID_TEAM_NAME |
```

### Feature: Team Shutdown with Directory Deletion

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

---

## 2. Teammate Lifecycle

### Feature: Teammate Spawn

```gherkin
Feature: Teammate Spawn
  As a team lead agent
  I want to spawn new teammate agents
  So that work can be distributed among specialized agents

  Background:
    Given the plugin is initialized with teamsDir "/tmp/test-teams"

  Scenario: Spawn teammate with minimal configuration
    Given an active team "dev-team"
    When I spawn a teammate with:
      | team_name  | dev-team   |
      | name       | researcher |
      | agent_type | Explore    |
    Then the response should contain:
      | agentId    | teammate-dev-team-researcher |
      | name       | researcher                   |
      | status     | idle                         |
    And the teammate should be added to ledger
    And an agent entry should be added to openclaw.json
    And a binding should be added to openclaw.json for:
      | channel | agent-team            |
      | peer    | direct:dev-team:researcher |

  Scenario: Spawn teammate with model specification
    Given an active team "ml-team"
    When I spawn a teammate with:
      | team_name  | ml-team       |
      | name       | model-runner  |
      | agent_type | Execute       |
      | model      | claude-opus-4 |
    Then the agent in openclaw.json should have:
      | model.primary | claude-opus-4 |

  Scenario: Reject spawn when team at capacity
    Given an active team "full-team" with 10 teammates
    When I spawn a teammate with:
      | team_name  | full-team  |
      | name       | eleventh   |
      | agent_type | General    |
    Then the response should contain error:
      | code | TEAM_AT_CAPACITY |

  Scenario: Reject spawn into non-existent team
    Given no team exists with name "phantom-team"
    When I spawn a teammate with:
      | team_name  | phantom-team |
      | name       | ghost        |
      | agent_type | General      |
    Then the response should contain error:
      | code | TEAM_NOT_FOUND |

  Scenario: Reject duplicate teammate name
    Given an active team "dup-team" with teammate "researcher"
    When I spawn a teammate with:
      | team_name  | dup-team   |
      | name       | researcher |
      | agent_type | Code       |
    Then the response should contain error:
      | code | DUPLICATE_TEAMMATE_NAME |
```

---

## 3. Task Management

### Feature: Task Creation

```gherkin
Feature: Task Creation
  As an agent in a team
  I want to create tasks with optional dependencies
  So that work can be tracked and coordinated

  Background:
    Given the plugin is initialized with teamsDir "/tmp/test-teams"
    And an active team "task-team"

  Scenario: Create task with required fields
    Given no tasks exist in team "task-team"
    When I create a task with:
      | team_name   | task-team               |
      | subject     | Implement feature X     |
      | description | Create the new feature  |
    Then the response should contain:
      | subject  | Implement feature X |
      | status   | pending             |
      | blocked  | false               |

  Scenario: Create task with dependency
    Given a task "setup-task" exists in team "task-team"
    When I create a task with:
      | team_name   | task-team       |
      | subject     | Dependent task  |
      | description | Depends on setup|
      | blockedBy   | <setup-task-id> |
    Then the response should contain:
      | blocked | true |
    And the task should have blockedBy containing "<setup-task-id>"

  Scenario: Reject circular dependency
    Given tasks form a chain: task-a -> task-b -> task-c
    When I create a task with:
      | team_name   | task-team      |
      | subject     | Circular task  |
      | blockedBy   | <task-c-id>    |
    Then the response should contain error:
      | code | CIRCULAR_DEPENDENCY |

  Scenario: Reject task with non-existent blocking task
    When I create a task with:
      | team_name   | task-team       |
      | subject     | Bad dependency  |
      | blockedBy   | non-existent-id |
    Then the response should contain error:
      | code | BLOCKING_TASK_NOT_FOUND |
```

### Feature: Task Claim

```gherkin
Feature: Task Claim
  As an agent in a team
  I want to claim available tasks
  So that I can take ownership of work items

  Background:
    Given the plugin is initialized with teamsDir "/tmp/test-teams"
    And an active team "claim-team"
    And I am authenticated as teammate "worker"

  Scenario: Claim available task
    Given a pending task "available-task" exists in team "claim-team"
    When I claim task "available-task" in team "claim-team"
    Then the response should contain:
      | status    | in_progress    |
      | owner     | session-worker |

  Scenario: Reject claim on already claimed task
    Given a task "claimed-task" exists with owner "other-session"
    When I claim task "claimed-task" in team "claim-team"
    Then the response should contain error:
      | code | TASK_ALREADY_CLAIMED |

  Scenario: Reject claim on blocked task
    Given a task "blocked-task" exists blocked by incomplete task "blocker"
    When I claim task "blocked-task" in team "claim-team"
    Then the response should contain error:
      | code | TASK_IS_BLOCKED |
```

### Feature: Task Complete

```gherkin
Feature: Task Complete
  As an agent in a team
  I want to mark my claimed tasks as completed
  So that dependent tasks can proceed

  Background:
    Given the plugin is initialized with teamsDir "/tmp/test-teams"
    And an active team "complete-team"
    And I am authenticated as teammate "worker"

  Scenario: Complete claimed task
    Given I have claimed task "my-task" in team "complete-team"
    When I complete task "my-task" in team "complete-team"
    Then the response should contain:
      | status      | completed   |

  Scenario: Reject complete on task owned by another
    Given a task "owned-task" exists with owner "other-session"
    When I complete task "owned-task" in team "complete-team"
    Then the response should contain error:
      | code | NOT_TASK_OWNER |

  Scenario: Completing task unblocks dependent tasks
    Given task "blocker" blocks task "waiting"
    When I complete task "blocker"
    Then task "waiting" should no longer be blocked
```

### Feature: Task List

```gherkin
Feature: Task List
  As an agent in a team
  I want to list tasks with optional filters
  So that I can see available work or track progress

  Background:
    Given the plugin is initialized with teamsDir "/tmp/test-teams"
    And an active team "list-team"

  Scenario: List all tasks in team
    Given team "list-team" has 5 tasks
    When I list tasks for team "list-team"
    Then the response should contain 5 tasks
    And each task should have id, subject, status, blocked, createdAt

  Scenario: List tasks filtered by status
    Given team "list-team" has tasks with statuses:
      | pending     | 3 |
      | in_progress | 2 |
      | completed   | 4 |
    When I list tasks for team "list-team" with status "pending"
    Then the response should contain 3 tasks
    And all tasks should have status "pending"

  Scenario: List tasks filtered by owner
    Given tasks are claimed by "agent-a" and "agent-b"
    When I list tasks with owner "agent-a"
    Then all returned tasks should have owner "agent-a"

  Scenario: List tasks excluding completed
    Given team "list-team" has completed and pending tasks
    When I list tasks with includeCompleted=false
    Then no completed tasks should be returned
```

---

## 4. Configuration Synchronization

### Feature: Agent Configuration Sync

```gherkin
Feature: Agent Configuration Sync
  As the plugin system
  I want to synchronize agent configurations with openclaw core
  So that teammates are properly registered and invocable

  Scenario: Spawn adds agent to openclaw.json
    Given an active team "sync-team"
    And openclaw.json has no agents matching "teammate-sync-team-*"
    When I spawn a teammate with:
      | team_name  | sync-team  |
      | name       | sync-agent |
      | agent_type | General    |
    Then openclaw.json should contain agent:
      | id        | teammate-sync-team-sync-agent |
    And openclaw.json should contain binding:
      | agentId | teammate-sync-team-sync-agent |
      | channel | agent-team                    |

  Scenario: Shutdown removes all team agents from config
    Given an active team "remove-team" with 3 teammates
    And openclaw.json contains 3 agents for team "remove-team"
    And openclaw.json contains 3 bindings for team "remove-team"
    When I shutdown team "remove-team"
    Then openclaw.json should contain 0 agents for team "remove-team"
    And openclaw.json should contain 0 bindings for team "remove-team"
```

---

## 5. Error Handling

### Feature: Error Handling

```gherkin
Feature: Error Handling
  As the plugin system
  I want to handle inconsistent states gracefully
  So that the system remains stable

  Scenario: Handle teammate with missing team directory
    Given a teammate "orphan" exists in ledger for team "missing-team"
    And no team directory exists for "missing-team"
    When the teammate attempts to claim a task
    Then the operation should fail with:
      | code | TEAM_NOT_FOUND |

  Scenario: Concurrent access handling
    Given a pending task "contended-task" exists
    When two agents attempt to claim the task simultaneously
    Then exactly one claim should succeed
    And one claim should fail with TASK_ALREADY_CLAIMED
```

### Feature: Failure Handling

```gherkin
Feature: Failure Handling
  As the plugin system
  I want to handle failures gracefully
  So that the system remains in a consistent state

  Scenario: Shutdown handles config write failure
    Given an active team "config-fail-team"
    And the config file is read-only
    When I shutdown team "config-fail-team"
    Then the response should contain error:
      | code | CONFIG_WRITE_FAILED |
    And the team directory should still exist

  Scenario: Spawn with invalid agent_type
    Given an active team "validation-team"
    When I spawn a teammate with:
      | team_name  | validation-team |
      | name       | invalid-agent   |
      | agent_type | InvalidType     |
    Then the response should contain error:
      | code | INVALID_AGENT_TYPE |

  Scenario: Complete already completed task
    Given a task "done-task" exists with status "completed"
    When I complete task "done-task"
    Then the response should contain error:
      | code | TASK_ALREADY_COMPLETED |
```

---

## Test Implementation Guidelines

### File Organization

```
tests/
  features/
    team-lifecycle.test.ts      # team_create, team_shutdown
    teammate-lifecycle.test.ts  # teammate_spawn
    task-management.test.ts     # task_create, task_list, task_claim, task_complete
    config-sync.test.ts         # openclaw.json sync
  __mocks__/
    runtime.ts
  helpers/
    test-helpers.ts
    fixture-factory.ts
```

### Test Pattern (Vitest)

```typescript
describe("Feature: Team Shutdown with Directory Deletion", () => {
  describe("Scenario: Shutdown team removes directory", () => {
    it("should delete team directory after shutdown", async () => {
      // Given
      const ctx = await createTestContext();
      await createTestTeam(ctx, { team_name: "shutdown-test" });

      // When
      const result = await createTeamShutdownTool(ctx).handler({
        team_name: "shutdown-test"
      });

      // Then
      expect(result).toMatchObject({ status: "shutdown" });
      await expect(
        teamDirectoryExists(ctx.teamsDir, "shutdown-test")
      ).resolves.toBe(false);
    });
  });
});
```

### Files to Delete (Tests)

| File | Reason |
|------|--------|
| `tests/mailbox.test.ts` | Messaging removed |
| `tests/context-injection.test.ts` | Hook removed |
| `tests/tools/send-message.test.ts` | Tool removed |
| `tests/tools/inbox.test.ts` | Tool removed |
