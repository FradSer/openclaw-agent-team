# Plugin Refactor Research Document

## Overview

This document provides research findings for the openclaw-agent-team plugin refactor, covering config synchronization, error handling, security considerations, and BDD scenarios.

---

## 1. Config Synchronization Best Practices

### Atomic Config Updates

The OpenClaw core's `writeConfigFile` provides atomicity through a temp-file-then-rename pattern:

```typescript
// Implementation pattern (in OpenClaw core)
async function writeConfigFile(config: OpenClawConfig): Promise<void> {
  const configPath = resolveConfigPath();

  // Use unique suffix to avoid conflicts with file watchers
  const suffix = randomBytes(6).toString('hex');
  const tempPath = `${configPath}.${suffix}.tmp`;

  // 1. Write to temp file
  await fs.writeFile(tempPath, JSON.stringify(config, null, 2));

  // 2. Atomic rename (POSIX guarantees atomicity)
  await fs.rename(tempPath, configPath);
}
```

**Key Implementation Details:**

1. **Unique Temp File Names**: Use random suffixes to prevent conflicts when file watchers are present. The `write-file-atomic` package demonstrates this with `murmurhex(__filename, process.pid, ++invocations)`.

2. **Temp File Cleanup**: Always clean up temp files on error:
   ```typescript
   try {
     await fs.writeFile(tempPath, data);
     await fs.rename(tempPath, finalPath);
   } catch (err) {
     await fs.unlink(tempPath).catch(() => {}); // Ignore cleanup errors
     throw err;
   }
   ```

3. **Write Serialization**: When multiple writes occur to the same path, queue them to prevent interference:
   ```typescript
   class ConfigWriter {
     private writeQueue = Promise.resolve();

     async writeConfig(config: OpenClawConfig): Promise<void> {
       this.writeQueue = this.writeQueue.then(() =>
         this._writeConfigInternal(config)
       );
       return this.writeQueue;
     }
   }
   ```

### Idempotent Operations

Always check for existing entities before creating:

```typescript
async function createAgent(runtime: PluginRuntime, config: DynamicAgentConfig) {
  const cfg = await runtime.config.loadConfig();

  // Check for existing agent
  const existingAgent = cfg.agents?.list?.find(a => a.id === config.agentId);
  if (existingAgent) {
    // Agent exists - ensure binding exists (idempotent)
    const hasBinding = cfg.bindings?.some(
      b => b.agentId === config.agentId &&
           b.match?.channel === "agent-team"
    );
    if (!hasBinding) {
      return await addBindingOnly(runtime, cfg, config);
    }
    return { agentId: config.agentId, created: false };
  }

  // Create new agent + binding
  return await createNewAgent(runtime, cfg, config);
}
```

### Proper Cleanup Sequence

Always remove entities in the correct order (dependencies first):

```typescript
async function removeAgent(runtime: PluginRuntime, agentId: string): Promise<void> {
  const cfg = await runtime.config.loadConfig();

  // 1. Remove bindings first (dependent on agent)
  const updatedBindings = (cfg.bindings ?? []).filter(
    b => b.agentId !== agentId
  );

  // 2. Remove agent entry
  const updatedAgents = (cfg.agents?.list ?? []).filter(
    a => a.id !== agentId
  );

  // 3. Atomic write - single update
  const updatedCfg = {
    ...cfg,
    agents: { ...cfg.agents, list: updatedAgents },
    bindings: updatedBindings,
  };

  await runtime.config.writeConfigFile(updatedCfg);
}
```

### Batch Removal Pattern

For team shutdown, batch all removals into a single config update:

```typescript
async function shutdownTeam(runtime: PluginRuntime, teamName: string): Promise<void> {
  const cfg = await runtime.config.loadConfig();
  const prefix = `teammate-${teamName}-`;

  // Collect all agent IDs for this team
  const teamAgentIds = new Set(
    (cfg.agents?.list ?? [])
      .filter(a => a.id.startsWith(prefix))
      .map(a => a.id)
  );

  // Single atomic update removing all agents and bindings
  const updatedCfg = {
    ...cfg,
    agents: {
      ...cfg.agents,
      list: (cfg.agents?.list ?? []).filter(a => !teamAgentIds.has(a.id)),
    },
    bindings: (cfg.bindings ?? []).filter(b => !teamAgentIds.has(b.agentId)),
  };

  await runtime.config.writeConfigFile(updatedCfg);
}
```

---

## 2. Error Handling Patterns

### Error Code Taxonomy

```typescript
export const ErrorCodes = {
  // Team errors
  TEAM_NOT_FOUND: "TEAM_NOT_FOUND",
  TEAM_ALREADY_EXISTS: "TEAM_ALREADY_EXISTS",
  TEAM_AT_CAPACITY: "TEAM_AT_CAPACITY",
  TEAM_NOT_ACTIVE: "TEAM_NOT_ACTIVE",
  TEAM_ALREADY_SHUTDOWN: "TEAM_ALREADY_SHUTDOWN",

  // Teammate errors
  TEAMMATE_NOT_FOUND: "TEAMMATE_NOT_FOUND",
  DUPLICATE_TEAMMATE_NAME: "DUPLICATE_TEAMMATE_NAME",
  INVALID_TEAMMATE_NAME: "INVALID_TEAMMATE_NAME",

  // Task errors
  TASK_NOT_FOUND: "TASK_NOT_FOUND",
  TASK_ALREADY_CLAIMED: "TASK_ALREADY_CLAIMED",
  TASK_ALREADY_COMPLETED: "TASK_ALREADY_COMPLETED",
  TASK_NOT_CLAIMED: "TASK_NOT_CLAIMED",
  TASK_IS_BLOCKED: "TASK_IS_BLOCKED",
  NOT_TASK_OWNER: "NOT_TASK_OWNER",
  BLOCKING_TASK_NOT_FOUND: "BLOCKING_TASK_NOT_FOUND",
  CIRCULAR_DEPENDENCY: "CIRCULAR_DEPENDENCY",

  // Validation errors
  INVALID_TEAM_NAME: "INVALID_TEAM_NAME",
  EMPTY_TEAM_NAME: "EMPTY_TEAM_NAME",
  TEAM_NAME_TOO_LONG: "TEAM_NAME_TOO_LONG",
  MISSING_SUBJECT: "MISSING_SUBJECT",
  MISSING_DESCRIPTION: "MISSING_DESCRIPTION",
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

export class TeamError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "TeamError";
  }
}
```

### Graceful Degradation

Handle missing or inconsistent state gracefully:

```typescript
async function getTeamOrThrow(teamsDir: string, teamName: string): Promise<TeamConfig> {
  // Validate team name format first
  if (!TEAM_NAME_PATTERN.test(teamName)) {
    throw new TeamError("INVALID_TEAM_NAME", `Invalid team name format: ${teamName}`);
  }

  const configPath = resolveTeamConfigPath(teamsDir, teamName);

  if (!existsSync(configPath)) {
    throw new TeamError("TEAM_NOT_FOUND", `Team "${teamName}" not found`);
  }

  try {
    const content = await readFile(configPath, "utf-8");
    const config = JSON.parse(content) as TeamConfig;

    // Validate config structure
    if (!config.id || !config.team_name || !config.metadata) {
      throw new TeamError("TEAM_NOT_FOUND", `Team "${teamName}" config is corrupted`);
    }

    return config;
  } catch (err) {
    if (err instanceof TeamError) throw err;

    // Log internally but don't expose internal errors
    console.error(`[agent-team] Failed to read team config:`, err);
    throw new TeamError("TEAM_NOT_FOUND", `Team "${teamName}" config is corrupted`);
  }
}
```

### Error Response Format

All tools should return consistent error responses:

```typescript
interface ToolError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

function createErrorResponse(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>
): ToolError {
  return {
    error: {
      code,
      message,
      ...(details && { details }),
    },
  };
}
```

---

## 3. Security Considerations

### Path Traversal Prevention

```typescript
const TEAM_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,50}$/;
const TEAMMATE_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/;

function resolveTeamPath(
  teamsDir: string,
  teamName: string,
  ...segments: string[]
): string {
  // Validate team name doesn't contain path separators
  if (!TEAM_NAME_PATTERN.test(teamName)) {
    throw new TeamError("INVALID_TEAM_NAME", `Invalid team name: ${teamName}`);
  }

  // Build the target path
  const targetPath = resolve(teamsDir, teamName, ...segments);
  const normalizedTeamsDir = resolve(teamsDir);

  // Ensure the resolved path is within the teams directory
  if (!targetPath.startsWith(normalizedTeamsDir + sep) && targetPath !== normalizedTeamsDir) {
    throw new TeamError(
      "INVALID_TEAM_NAME",
      `Path traversal detected: attempted to access path outside teams directory`
    );
  }

  return targetPath;
}
```

### Channel Isolation

The `agent-team` channel is isolated from external channels:

```typescript
// Binding only matches agent-team channel
const binding = {
  agentId: "teammate-team-agent",
  match: {
    channel: "agent-team",  // Only matches internal channel
    peer: { kind: "direct", id: "team:agent" }
  }
};
```

### Agent ID Collision Prevention

```typescript
const TEAMMATE_PREFIX = "teammate-";
const MAX_ID_LENGTH = 64;

function buildAgentId(teamName: string, teammateName: string): string {
  const sanitized = `${teamName}-${teammateName}`
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-");

  const id = `${TEAMMATE_PREFIX}${sanitized}`;

  if (id.length > MAX_ID_LENGTH) {
    throw new TeamError(
      "INVALID_TEAMMATE_NAME",
      `Agent ID too long (max ${MAX_ID_LENGTH} characters)`
    );
  }

  return id;
}

function isTeammateAgent(agentId: string): boolean {
  return agentId.startsWith(TEAMMATE_PREFIX);
}
```

### Directory Permissions

```typescript
// Create directories with secure permissions
await mkdir(teamDir, { recursive: true, mode: 0o700 });    // rwx------
await writeFile(configPath, "{}", { mode: 0o600 });        // rw-------
await mkdir(join(teamDir, "agents"), { mode: 0o700 });     // rwx------
```

### Workspace Isolation

Each teammate has isolated workspace:

```
~/.openclaw/teams/{team}/agents/{teammate}/workspace/
~/.openclaw/teams/{team}/agents/{teammate}/agent/
```

---

## 4. BDD Scenarios (Gherkin Format)

### Feature: Team Creation

```gherkin
Feature: Team Creation
  As a team lead agent
  I want to create a new team with isolated storage
  So that I can coordinate multiple agents on complex tasks

  Background:
    Given the plugin is initialized with teamsDir "~/.openclaw/teams"

  Scenario: Create team with minimal parameters
    Given no team exists with name "my-project"
    When I create a team with:
      | team_name | my-project |
    Then the response should contain:
      | teamId    | <UUID>     |
      | teamName  | my-project |
      | status    | active     |
    And a directory should exist at "~/.openclaw/teams/my-project/"
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

  Scenario: Create team with custom agent_type
    Given no team exists with name "custom-team"
    When I create a team with:
      | team_name  | custom-team |
      | agent_type | custom-lead |
    Then config.json should contain:
      | agent_type | custom-lead |

  Scenario: Reject duplicate team name
    Given a team exists with name "existing-team"
    When I create a team with:
      | team_name | existing-team |
    Then the response should contain error:
      | code    | DUPLICATE_TEAM_NAME |
      | message | already exists      |

  Scenario: Reject invalid team name with special characters
    When I create a team with:
      | team_name | invalid name |
    Then the response should contain error:
      | code | INVALID_TEAM_NAME |

  Scenario: Reject path traversal attempt
    When I create a team with:
      | team_name | ../escape |
    Then the response should contain error:
      | code | INVALID_TEAM_NAME |

  Scenario: Reject team name exceeding 50 characters
    When I create a team with:
      | team_name | aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaA |
    Then the response should contain error:
      | code    | TEAM_NAME_TOO_LONG |
      | message | 50 characters      |

  Scenario: Accept team name with exactly 50 characters
    When I create a team with:
      | team_name | aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa |
    Then the response should contain:
      | status | active |

  Scenario: Reject empty team name
    When I create a team with:
      | team_name | |
    Then the response should contain error:
      | code    | EMPTY_TEAM_NAME |
      | message | required        |
```

### Feature: Team Shutdown

```gherkin
Feature: Team Shutdown
  As a team lead agent
  I want to gracefully shut down a team and delete all resources
  So that the system is cleaned up properly

  Background:
    Given the plugin is initialized with teamsDir "~/.openclaw/teams"

  Scenario: Shutdown team with teammates
    Given an active team "shutdown-test" with 3 teammates:
      | researcher |
      | coder      |
      | reviewer   |
    When I shutdown team "shutdown-test"
    Then the response should contain:
      | status            | shutdown |
      | teammatesNotified | 3        |
    And all teammate agents should be removed from openclaw.json
    And all teammate bindings should be removed from openclaw.json
    And the team directory should NOT exist

  Scenario: Shutdown removes team directory completely
    Given an active team "remove-dir-test"
    And the team directory exists with files:
      | config.json |
      | tasks.jsonl |
      | members.jsonl |
    When I shutdown team "remove-dir-test"
    Then the team directory "~/.openclaw/teams/remove-dir-test" should NOT exist

  Scenario: Shutdown team with no teammates
    Given an active team "empty-team" with 0 teammates
    When I shutdown team "empty-team"
    Then the response should contain:
      | status            | shutdown |
      | teammatesNotified | 0        |
    And the team directory should NOT exist

  Scenario: Reject shutdown of non-existent team
    Given no team exists with name "ghost-team"
    When I shutdown team "ghost-team"
    Then the response should contain error:
      | code    | TEAM_NOT_FOUND |
      | message | not found      |

  Scenario: Reject shutdown of already shutdown team
    Given a team "already-down" with status "shutdown"
    When I shutdown team "already-down"
    Then the response should contain error:
      | code    | TEAM_ALREADY_SHUTDOWN |
      | message | already shutdown      |

  Scenario: Shutdown is atomic - config cleanup happens even if directory deletion fails
    Given an active team "atomic-test" with 2 teammates
    When I shutdown team "atomic-test"
    Then agents should be removed from openclaw.json
    And bindings should be removed from openclaw.json
    And if directory deletion fails, config cleanup should still be persisted

  Scenario: Shutdown with optional reason
    Given an active team "reason-team" with 1 teammate
    When I shutdown team "reason-team" with reason "Project completed"
    Then the response should contain:
      | status | shutdown |
```

### Feature: Teammate Spawn

```gherkin
Feature: Teammate Spawn
  As a team lead agent
  I want to spawn new teammate agents
  So that work can be distributed among specialized agents

  Background:
    Given the plugin is initialized with teamsDir "~/.openclaw/teams"

  Scenario: Spawn teammate with minimal configuration
    Given an active team "dev-team"
    When I spawn a teammate with:
      | team_name  | dev-team   |
      | name       | researcher |
      | agent_type | Explore    |
    Then the response should contain:
      | agentId    | teammate-dev-team-researcher |
      | name       | researcher                   |
      | sessionKey | agent:teammate-dev-team-researcher:main |
      | status     | idle                         |
    And the teammate should be added to members.jsonl
    And an agent entry should be added to openclaw.json with id "teammate-dev-team-researcher"
    And a binding should be added to openclaw.json for:
      | channel | agent-team                  |
      | peer    | direct:dev-team:researcher  |
    And workspace directory should be created at "dev-team/agents/researcher/workspace"
    And agent directory should be created at "dev-team/agents/researcher/agent"

  Scenario: Spawn teammate with model specification
    Given an active team "ml-team"
    When I spawn a teammate with:
      | team_name  | ml-team       |
      | name       | model-runner  |
      | agent_type | Execute       |
      | model      | claude-opus-4 |
    Then members.jsonl should contain teammate "model-runner" with:
      | model | claude-opus-4 |

  Scenario: Spawn teammate with tools configuration
    Given an active team "tools-team"
    When I spawn a teammate with:
      | team_name  | tools-team |
      | name       | specialist |
      | agent_type | Code       |
      | tools      | allow:read_file,write_file |
    Then members.jsonl should contain teammate "specialist" with:
      | tools.allow | ["read_file", "write_file"] |

  Scenario: Reject spawn when team at capacity
    Given an active team "full-team" with 10 teammates
    When I spawn a teammate with:
      | team_name  | full-team  |
      | name       | eleventh   |
      | agent_type | General    |
    Then the response should contain error:
      | code    | TEAM_AT_CAPACITY |
      | message | maximum          |

  Scenario: Reject spawn into non-existent team
    Given no team exists with name "phantom-team"
    When I spawn a teammate with:
      | team_name  | phantom-team |
      | name       | ghost        |
      | agent_type | General      |
    Then the response should contain error:
      | code    | TEAM_NOT_FOUND |
      | message | not found      |

  Scenario: Reject spawn into shutdown team
    Given a team "down-team" with status "shutdown"
    When I spawn a teammate with:
      | team_name  | down-team |
      | name       | latecomer |
      | agent_type | General   |
    Then the response should contain error:
      | code    | TEAM_NOT_ACTIVE |
      | message | not active      |

  Scenario: Reject duplicate teammate name
    Given an active team "dup-team" with teammate "researcher"
    When I spawn a teammate with:
      | team_name  | dup-team   |
      | name       | researcher |
      | agent_type | Code       |
    Then the response should contain error:
      | code    | DUPLICATE_TEAMMATE_NAME |
      | message | already exists          |

  Scenario: Reject invalid teammate name
    Given an active team "valid-team"
    When I spawn a teammate with:
      | team_name  | valid-team |
      | name       | invalid name! |
      | agent_type | General    |
    Then the response should contain error:
      | code    | INVALID_TEAMMATE_NAME |
      | message | invalid characters    |

  Scenario: Idempotent spawn - existing agent gets binding ensured
    Given an active team "idem-team"
    And an agent "teammate-idem-team-researcher" exists in openclaw.json
    And no binding exists for agent "teammate-idem-team-researcher"
    When I spawn a teammate with:
      | team_name  | idem-team   |
      | name       | researcher  |
      | agent_type | General     |
    Then a binding should be added to openclaw.json
    And the response should contain:
      | agentId | teammate-idem-team-researcher |
```

### Feature: Task Create

```gherkin
Feature: Task Create
  As an agent in a team
  I want to create tasks with optional dependencies
  So that work can be tracked and coordinated

  Background:
    Given the plugin is initialized with teamsDir "~/.openclaw/teams"
    And an active team "task-team"

  Scenario: Create task with required fields
    Given no tasks exist in team "task-team"
    When I create a task with:
      | team_name   | task-team               |
      | subject     | Implement feature X     |
      | description | Create the new feature  |
    Then the response should contain:
      | taskId   | <UUID>               |
      | subject  | Implement feature X  |
      | status   | pending              |
      | blocked  | false                |
    And the task should be persisted in tasks.jsonl

  Scenario: Create task with activeForm
    Given an active team "task-team"
    When I create a task with:
      | team_name   | task-team          |
      | subject     | Review code        |
      | description | Review the PR      |
      | activeForm  | Reviewing code     |
    Then the task should have activeForm "Reviewing code"

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

  Scenario: Create task with multiple dependencies
    Given tasks "task-a" and "task-b" exist in team "task-team"
    When I create a task with:
      | team_name   | task-team           |
      | subject     | Multi-dependent     |
      | description | Depends on multiple |
      | blockedBy   | <task-a-id>,<task-b-id> |
    Then the task should have blockedBy containing 2 task IDs

  Scenario: Reject circular dependency
    Given tasks form a chain: task-a -> task-b -> task-c
    When I create a task with:
      | team_name   | task-team      |
      | subject     | Circular task  |
      | description | Creates cycle  |
      | blockedBy   | <task-c-id>    |
    Then the response should contain error:
      | code    | CIRCULAR_DEPENDENCY |
      | message | circular            |

  Scenario: Reject task with non-existent blocking task
    When I create a task with:
      | team_name   | task-team       |
      | subject     | Bad dependency  |
      | description | Invalid blocker |
      | blockedBy   | non-existent-id |
    Then the response should contain error:
      | code    | BLOCKING_TASK_NOT_FOUND |
      | message | not found               |

  Scenario: Reject task with empty subject
    When I create a task with:
      | team_name   | task-team |
      | subject     |           |
      | description | Some desc |
    Then the response should contain error:
      | code    | MISSING_SUBJECT |
      | message | required        |

  Scenario: Reject task with empty description
    When I create a task with:
      | team_name   | task-team |
      | subject     | Some task |
      | description |           |
    Then the response should contain error:
      | code    | MISSING_DESCRIPTION |
      | message | required            |

  Scenario: Reject task for non-existent team
    Given no team exists with name "no-team"
    When I create a task with:
      | team_name   | no-team   |
      | subject     | Some task |
      | description | Some desc |
    Then the response should contain error:
      | code | TEAM_NOT_FOUND |
```

### Feature: Task List

```gherkin
Feature: Task List
  As an agent in a team
  I want to list tasks with optional filters
  So that I can see available work or track progress

  Background:
    Given the plugin is initialized with teamsDir "~/.openclaw/teams"
    And an active team "list-team"

  Scenario: List all tasks in team
    Given team "list-team" has 5 tasks
    When I list tasks for team "list-team"
    Then the response should contain:
      | count | 5 |
    And each task should have id, subject, status, blocked, createdAt

  Scenario: List tasks sorted by createdAt descending
    Given team "list-team" has tasks created at different times
    When I list tasks for team "list-team"
    Then tasks should be sorted by createdAt descending

  Scenario: List tasks filtered by status
    Given team "list-team" has tasks with statuses:
      | pending     | 3 |
      | in_progress | 2 |
      | completed   | 4 |
    When I list tasks for team "list-team" with status "pending"
    Then the response should contain:
      | count | 3 |
    And all tasks should have status "pending"

  Scenario: List tasks filtered by owner
    Given tasks are claimed by "agent-a" and "agent-b":
      | agent-a | 3 |
      | agent-b | 2 |
    When I list tasks with owner "agent-a"
    Then the response should contain:
      | count | 3 |
    And all returned tasks should have owner "agent-a"

  Scenario: List tasks excluding completed by default
    Given team "list-team" has tasks with statuses:
      | pending     | 3 |
      | completed   | 4 |
    When I list tasks for team "list-team"
    Then the response should contain:
      | count | 3 |
    And no completed tasks should be returned

  Scenario: List tasks including completed when specified
    Given team "list-team" has tasks with statuses:
      | pending     | 3 |
      | completed   | 4 |
    When I list tasks for team "list-team" with includeCompleted=true
    Then the response should contain:
      | count | 7 |

  Scenario: List tasks for empty team
    Given an active team "empty-team" with no tasks
    When I list tasks for team "empty-team"
    Then the response should contain:
      | tasks | [] |
      | count | 0  |

  Scenario: List tasks for non-existent team
    Given no team exists with name "ghost-team"
    When I list tasks for team "ghost-team"
    Then the response should contain error:
      | code | TEAM_NOT_FOUND |

  Scenario: List tasks shows blocked status correctly
    Given task "blocked-task" is blocked by incomplete task "blocker"
    And task "free-task" has no dependencies
    When I list tasks for team "list-team"
    Then task "blocked-task" should have blocked=true
    And task "free-task" should have blocked=false
```

### Feature: Task Claim

```gherkin
Feature: Task Claim
  As an agent in a team
  I want to claim available tasks
  So that I can take ownership of work items

  Background:
    Given the plugin is initialized with teamsDir "~/.openclaw/teams"
    And an active team "claim-team"
    And I am authenticated as teammate "worker"

  Scenario: Claim available task
    Given a pending task "available-task" exists in team "claim-team"
    When I claim task "available-task" in team "claim-team"
    Then the response should contain:
      | taskId    | <available-task-id> |
      | status    | in_progress         |
      | owner     | <my-session-key>    |
      | claimedAt | <timestamp>         |
    And the task status should be "in_progress" in tasks.jsonl

  Scenario: Claim sets claimedAt timestamp
    Given a pending task "timestamp-task" exists
    When I claim task "timestamp-task"
    Then the response should contain claimedAt within 1 second of now

  Scenario: Reject claim on already claimed task
    Given a task "claimed-task" exists with owner "other-session"
    When I claim task "claimed-task" in team "claim-team"
    Then the response should contain error:
      | code    | TASK_ALREADY_CLAIMED |
      | message | already claimed      |

  Scenario: Reject claim on completed task
    Given a completed task "done-task" exists
    When I claim task "done-task" in team "claim-team"
    Then the response should contain error:
      | code    | TASK_ALREADY_COMPLETED |
      | message | already completed      |

  Scenario: Reject claim on blocked task
    Given a task "blocked-task" exists blocked by incomplete task "blocker"
    When I claim task "blocked-task" in team "claim-team"
    Then the response should contain error:
      | code    | TASK_IS_BLOCKED |
      | message | blocked by      |

  Scenario: Reject claim on non-existent task
    When I claim task "non-existent-task" in team "claim-team"
    Then the response should contain error:
      | code    | TASK_NOT_FOUND |
      | message | not found      |

  Scenario: Reject claim for non-existent team
    Given no team exists with name "no-team"
    When I claim task "any-task" in team "no-team"
    Then the response should contain error:
      | code | TEAM_NOT_FOUND |
```

### Feature: Task Complete

```gherkin
Feature: Task Complete
  As an agent in a team
  I want to mark my claimed tasks as completed
  So that dependent tasks can proceed

  Background:
    Given the plugin is initialized with teamsDir "~/.openclaw/teams"
    And an active team "complete-team"
    And I am authenticated as teammate "worker"

  Scenario: Complete claimed task
    Given I have claimed task "my-task" in team "complete-team"
    When I complete task "my-task" in team "complete-team"
    Then the response should contain:
      | taskId      | <my-task-id> |
      | status      | completed    |
      | completedAt | <timestamp>  |
    And the task status should be "completed" in tasks.jsonl

  Scenario: Complete sets completedAt timestamp
    Given I have claimed task "timestamp-task"
    When I complete task "timestamp-task"
    Then the response should contain completedAt within 1 second of now

  Scenario: Reject complete on task owned by another
    Given a task "owned-task" exists with owner "other-session"
    When I complete task "owned-task" in team "complete-team"
    Then the response should contain error:
      | code    | NOT_TASK_OWNER |
      | message | owned by       |

  Scenario: Reject complete on pending (unclaimed) task
    Given a pending task "unclaimed-task" exists
    When I complete task "unclaimed-task" in team "complete-team"
    Then the response should contain error:
      | code    | TASK_NOT_CLAIMED |
      | message | not been claimed |

  Scenario: Reject complete on already completed task
    Given a completed task "already-done" exists
    When I complete task "already-done" in team "complete-team"
    Then the response should contain error:
      | code    | TASK_ALREADY_COMPLETED |
      | message | already completed      |

  Scenario: Reject complete on non-existent task
    When I complete task "non-existent-task" in team "complete-team"
    Then the response should contain error:
      | code    | TASK_NOT_FOUND |
      | message | not found      |

  Scenario: Completing task unblocks dependent tasks
    Given task "blocker" blocks task "waiting"
    And task "waiting" has status "pending" and blocked=true
    When I complete task "blocker"
    Then task "waiting" should no longer be blocked
    And task "waiting" should have blocked=false when listed

  Scenario: Reject complete for non-existent team
    Given no team exists with name "no-team"
    When I complete task "any-task" in team "no-team"
    Then the response should contain error:
      | code | TEAM_NOT_FOUND |
```

---

## 5. Implementation Checklist

### Files to Remove

- [ ] `src/mailbox.ts` - Remove messaging storage
- [ ] `src/tools/send-message.ts` - Remove send_message tool
- [ ] `src/tools/inbox.ts` - Remove inbox tool
- [ ] `src/context-injection.ts` - Remove message injection hook
- [ ] `src/teammate-invoker.ts` - Remove direct invocation
- [ ] `src/reply-dispatcher.ts` - Remove reply dispatching

### Files to Modify

- [ ] `src/index.ts` - Remove messaging tool registrations and context hook
- [ ] `src/tools/team-shutdown.ts` - Add directory deletion
- [ ] `src/tools/teammate-spawn.ts` - Use AgentManager pattern
- [ ] `src/storage.ts` - Add `deleteTeamDirectory` function

### Files to Add

- [ ] `src/core/agent-manager.ts` - Centralized agent lifecycle management

### Tests to Update

- [ ] Remove `tests/mailbox.test.ts`
- [ ] Remove `tests/tools/send-message.test.ts`
- [ ] Remove `tests/tools/inbox.test.ts`
- [ ] Remove `tests/context-injection.test.ts`
- [ ] Update `tests/tools/team-shutdown.test.ts` - Add directory deletion tests
- [ ] Add `tests/core/agent-manager.test.ts`

---

## 6. References

- Best practices document: `/docs/plans/2026-03-03-plugin-refactor-design/best-practices.md`
- Architecture document: `/docs/plans/2026-03-03-plugin-refactor-design/architecture.md`
- Existing BDD specs: `/docs/plans/2026-03-03-plugin-refactor-design/bdd-specs.md`
- OpenClaw plugin SDK: `openclaw/plugin-sdk`
