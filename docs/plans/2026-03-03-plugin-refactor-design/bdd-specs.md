# BDD Specifications

## Overview

This document provides Gherkin-style BDD specifications for the refactored openclaw-agent-team plugin.

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
      | code | DUPLICATE_TEAM_NAME |

  Scenario: Reject invalid team name
    When I create a team with:
      | team_name | ../escape |
    Then the response should contain error:
      | code | INVALID_TEAM_NAME |
```

### Feature: Team Shutdown

```gherkin
Feature: Team Shutdown
  As a team lead agent
  I want to gracefully shut down a team
  So that all resources are cleaned up

  Background:
    Given the plugin is initialized with teamsDir "/tmp/test-teams"

  Scenario: Shutdown team with teammates
    Given an active team "shutdown-test" with 3 teammates:
      | researcher |
      | coder      |
      | reviewer   |
    When I shutdown team "shutdown-test"
    Then the team config should have status "shutdown"
    And all teammate agents should be removed from openclaw.json
    And all teammate bindings should be removed from openclaw.json

  Scenario: Shutdown removes team directory
    Given an active team "remove-dir-test"
    When I shutdown team "remove-dir-test"
    Then the team directory should NOT exist

  Scenario: Reject shutdown of non-existent team
    Given no team exists with name "ghost-team"
    When I shutdown team "ghost-team"
    Then the response should contain error:
      | code | TEAM_NOT_FOUND |
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
    And the teammate should be added to members.jsonl
    And an agent entry should be added to openclaw.json with id "teammate-dev-team-researcher"
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
    Then members.jsonl should contain teammate "model-runner" with:
      | model | claude-opus-4 |

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

### Feature: Teammate Remove

```gherkin
Feature: Teammate Remove
  As a team lead agent
  I want to remove teammate agents from my team
  So that I can clean up after tasks are completed

  Background:
    Given the plugin is initialized with teamsDir "/tmp/test-teams"

  Scenario: Remove existing teammate
    Given an active team "remove-team" with teammate "old-agent"
    When I remove teammate "old-agent" from team "remove-team"
    Then the teammate should be removed from members.jsonl
    And the agent should be removed from openclaw.json
    And the binding should be removed from openclaw.json
    And the response should contain:
      | status | removed |

  Scenario: Remove non-existent teammate
    Given an active team "some-team"
    When I remove teammate "ghost" from team "some-team"
    Then the response should contain error:
      | code | TEAMMATE_NOT_FOUND |

  Scenario: Remove teammate from non-existent team
    Given no team exists with name "no-team"
    When I remove teammate "agent" from team "no-team"
    Then the response should contain error:
      | code | TEAM_NOT_FOUND |
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

---

## 4. Task List

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

  Scenario: List tasks for non-existent team
    Given no team exists with name "ghost-team"
    When I list tasks for team "ghost-team"
    Then the response should contain error:
      | code | TEAM_NOT_FOUND |

  Scenario: List tasks for empty team
    Given an active team "empty-team" with no tasks
    When I list tasks for team "empty-team"
    Then the response should contain:
      | tasks | [] |
```

---

## 5. Configuration Synchronization

### Feature: Agent Configuration Sync

```gherkin
Feature: Agent Configuration Sync
  As the plugin system
  I want to synchronize agent configurations with openclaw core
  So that teammates are properly registered and invocable

  Scenario: Spawn adds agent to openclaw.json
    Given an active team "sync-team"
    And openclaw.json has 0 agents
    When I spawn a teammate with:
      | team_name  | sync-team  |
      | name       | sync-agent |
      | agent_type | General    |
    Then openclaw.json should contain agent:
      | id        | teammate-sync-team-sync-agent |

  Scenario: Spawn creates binding for agent-team channel
    Given an active team "binding-team"
    When I spawn a teammate with:
      | team_name  | binding-team |
      | name       | bound-agent  |
      | agent_type | General      |
    Then openclaw.json should contain binding:
      | agentId | teammate-binding-team-bound-agent |
      | channel | agent-team                         |

  Scenario: Shutdown removes all team agents from config
    Given an active team "remove-team" with 3 teammates
    When I shutdown team "remove-team"
    Then openclaw.json should contain 0 agents for team "remove-team"
    And openclaw.json should contain 0 bindings for team "remove-team"

  Scenario: Remove teammate removes from config
    Given an active team "partial-team" with teammates:
      | agent-a |
      | agent-b |
      | agent-c |
    When I remove teammate "agent-b" from team "partial-team"
    Then openclaw.json should contain agent "agent-a"
    And openclaw.json should NOT contain agent "agent-b"
    And openclaw.json should contain agent "agent-c"
```

---

## 6. Error Handling

> **Note**: Messaging tools (`send_message`, `inbox`) are removed in this refactor.
> Agents should use OpenClaw core's `sessions_send` for inter-agent communication.

### Feature: Orphaned Teammate Detection

```gherkin
Feature: Orphaned Teammate Detection
  As the plugin system
  I want to handle inconsistent states gracefully
  So that the system remains stable

  Scenario: Handle teammate with missing team directory
    Given a teammate "orphan" exists in ledger for team "missing-team"
    And no team directory exists for "missing-team"
    When the teammate attempts to claim a task
    Then the operation should fail with:
      | code | TEAM_NOT_FOUND |

  Scenario: Handle binding pointing to non-existent agent
    Given a binding exists for agent "teammate-test-ghost"
    And no agent entry exists in openclaw.json
    When a message is routed to the binding
    Then the message should still be delivered with fallback
```

### Feature: Concurrent Access Handling

```gherkin
Feature: Concurrent Access Handling
  As the plugin system
  I want to handle concurrent access safely
  So that data integrity is maintained

  Scenario: Multiple agents claim same task
    Given a pending task "contended-task" exists
    When two agents attempt to claim the task simultaneously
    Then exactly one claim should succeed
    And one claim should fail with TASK_ALREADY_CLAIMED

  Scenario: Ledger persists across concurrent operations
    Given multiple teammates are creating tasks simultaneously
    When all operations complete
    Then all tasks should be persisted in the ledger
    And no data corruption should occur
```

---

## Test Implementation Guidelines

### File Organization

```
tests/
  features/
    team-lifecycle.test.ts
    teammate-lifecycle.test.ts
    task-management.test.ts
    config-sync.test.ts
    error-handling.test.ts
  __mocks__/
    runtime.ts
    config.ts
  helpers/
    test-helpers.ts
    fixture-factory.ts
```

### Test Pattern (Vitest)

```typescript
describe("Feature: Team Creation", () => {
  describe("Scenario: Create team with minimal parameters", () => {
    it("should create team with valid UUID and active status", async () => {
      // Given
      const ctx = await createTestContext();

      // When
      const result = await createTeamCreateTool(ctx).handler({
        team_name: "my-project"
      });

      // Then
      expect(result).toMatchObject({
        teamName: "my-project",
        status: "active"
      });
      expect(result.teamId).toMatch(UUID_PATTERN);
    });
  });
});
```
