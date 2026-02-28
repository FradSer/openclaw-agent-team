# BDD Specifications

## Feature: Team Management

### Scenario: Create a new team

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

### Scenario: Shutdown a team

```gherkin
Feature: Team Shutdown

  Scenario: Shutdown active team with teammates
    Given team "project-alpha" exists with 3 active teammates
    When I call team_shutdown with team_name "project-alpha"
    Then all 3 teammates receive shutdown_request messages
    And all teammate processes are terminated
    And the team status becomes "shutdown"
    And the response contains shutdown confirmation

  Scenario: Shutdown non-existent team
    Given no team exists with name "unknown-team"
    When I call team_shutdown with team_name "unknown-team"
    Then the response contains error "Team 'unknown-team' not found"

  Scenario: Shutdown already shutdown team
    Given team "completed-project" has status "shutdown"
    When I call team_shutdown with team_name "completed-project"
    Then the response contains warning "Team already shutdown"
```

## Feature: Teammate Spawning

### Scenario: Spawn a teammate agent

```gherkin
Feature: Teammate Management

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
      | team_name | dev-team   |
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

## Feature: Task Management

### Scenario: Create tasks

```gherkin
Feature: Task Creation

  Scenario: Create task with all fields
    Given team "dev-team" exists
    When I call task_create with:
      | team_name   | dev-team              |
      | subject     | Implement auth        |
      | description | Add OAuth2 login flow |
      | activeForm  | Implementing auth     |
    Then a task is created with a unique ID
    And the task status is "pending"
    And the task appears in task_list output

  Scenario: Create task with dependencies
    Given task "task-1" exists with status "pending"
    When I call task_create with:
      | team_name | dev-team |
      | subject   | Write tests |
      | blockedBy | task-1   |
    Then the task is created with status "pending"
    And the task shows as blocked in task_list

  Scenario: Create task with circular dependency
    Given task "task-a" depends on "task-b"
    When I call task_create for "task-b" with blockedBy "task-a"
    Then the response contains error about circular dependency

  Scenario: Create task in non-existent team
    When I call task_create with team_name "unknown-team"
    Then the response contains error "Team not found"
```

### Scenario: Claim and complete tasks

```gherkin
Feature: Task Workflow

  Scenario: Claim available task
    Given task "task-123" exists with status "pending"
    And I am teammate "worker-1"
    When I call task_claim with task_id "task-123"
    Then the task status becomes "in_progress"
    And the task owner is set to my session key
    And the claimedAt timestamp is recorded

  Scenario: Claim task already claimed by another
    Given task "task-456" is claimed by "worker-2"
    When I call task_claim with task_id "task-456"
    Then the response contains error "Task already claimed"
    And the current owner is indicated

  Scenario: Claim blocked task
    Given task "task-blocked" has blockedBy "task-unfinished"
    And task "task-unfinished" status is "pending"
    When I call task_claim with task_id "task-blocked"
    Then the response contains error "Task is blocked"
    And the blocking tasks are listed

  Scenario: Complete claimed task
    Given I have claimed task "task-789"
    When I call task_complete with:
      | task_id | task-789 |
      | result  | Success  |
    Then the task status becomes "completed"
    And the completedAt timestamp is recorded
    And the result is stored

  Scenario: Complete task not owned by me
    Given task "task-other" is claimed by "worker-3"
    When I call task_complete with task_id "task-other"
    Then the response contains error "Not task owner"

  Scenario: Unblocked task becomes claimable
    Given task "task-dependent" is blocked by "task-prereq"
    When task "task-prereq" is completed
    Then task "task-dependent" is no longer blocked
    And task "task-dependent" can be claimed
```

### Scenario: List tasks

```gherkin
Feature: Task Listing

  Scenario: List all tasks
    Given team "project" has 5 tasks
    When I call task_list with team_name "project"
    Then the response contains 5 tasks
    And each task has: id, subject, status, owner, blocked status

  Scenario: Filter tasks by status
    Given team "project" has 3 pending and 2 completed tasks
    When I call task_list with status "pending"
    Then the response contains 3 tasks
    And all tasks have status "pending"

  Scenario: Filter tasks by owner
    Given teammate "worker-1" has claimed 2 tasks
    When I call task_list with owner "worker-1"
    Then the response contains 2 tasks
    And all tasks are owned by "worker-1"

  Scenario: Include completed tasks
    Given team "project" has 10 completed tasks
    When I call task_list with includeCompleted true
    Then the response contains completed tasks
    And completed tasks show completion time
```

## Feature: Inter-Agent Communication

### Scenario: Send messages

```gherkin
Feature: Messaging

  Scenario: Send direct message to teammate
    Given teammate "researcher" exists in team "project"
    When I call send_message with:
      | recipient | researcher              |
      | content   | Focus on the API design |
      | summary   | Task assignment         |
    Then the message is appended to ~/.openclaw/teams/project/inbox/{sessionKey}/messages.jsonl
    And the message has a unique ID and timestamp
    And a heartbeat wake is requested for the researcher session

  Scenario: Send message to non-existent teammate
    When I call send_message with recipient "unknown-teammate"
    Then the response contains error "Recipient not found"

  Scenario: Broadcast to all teammates
    Given team "project" has 3 active teammates
    When I call send_message with type "broadcast"
    Then all 3 teammates receive the message
    And each teammate's inbox is updated
    And heartbeat wake is requested for all 3 teammates

  Scenario: Message exceeds size limit
    When I call send_message with content larger than 100KB
    Then the response contains error "Message too large"
```

### Scenario: Read inbox

```gherkin
Feature: Inbox

  Scenario: Read pending messages
    Given my inbox has 3 unread messages
    When I call inbox
    Then I receive 3 messages in chronological order
    And each message has: id, from, content, summary, timestamp

  Scenario: Read and clear inbox
    Given my inbox has 2 messages
    When I call inbox with clear true
    Then I receive the 2 messages
    And my inbox file is cleared

  Scenario: Empty inbox
    Given my inbox is empty
    When I call inbox
    Then the response contains empty messages array

  Scenario: Limit message count
    Given my inbox has 10 messages
    When I call inbox with limit 5
    Then I receive the 5 most recent messages
```

### Scenario: Context Injection (Heartbeat Wake Flow)

```gherkin
Feature: Message Delivery via Context Injection

  Scenario: Teammate receives message via context injection
    Given teammate "researcher" is idle in team "project"
    And team lead sends message "Focus on API" to researcher
    When researcher's heartbeat wake fires
    Then the before_prompt_build hook is triggered
    And researcher's inbox messages are read
    And messages are converted to XML format
    And XML is injected as prependContext in system prompt
    And researcher sees the message in their context
    And the inbox is cleared after injection

  Scenario: Multiple messages are batched
    Given researcher has 3 pending messages in inbox
    When researcher's heartbeat wake fires
    Then all 3 messages are injected in one context block
    And the XML contains 3 teammate-message elements
    And all 3 messages are cleared from inbox

  Scenario: XML message format
    Given a message with:
      | from    | lead               |
      | type    | message            |
      | summary | Task assignment    |
      | content | Focus on the API   |
    When converted to XML
    Then the output is:
      '''
      <teammate-message from="lead" type="message" summary="Task assignment">
        Focus on the API
      </teammate-message>
      '''

  Scenario: Heartbeat coalescing
    Given team lead sends 5 messages rapidly to researcher
    Then only 1 heartbeat wake is scheduled
    And researcher processes all 5 messages in one wake cycle

  Scenario: Teammate not in team has no context injection
    Given agent session is not a teammate (no "teammate-" prefix)
    When before_prompt_build hook fires
    Then no inbox messages are read
    And empty prependContext is returned
```

### Scenario: Message Persistence

```gherkin
Feature: Message Persistence

  Scenario: Messages survive gateway restart
    Given researcher has 2 unread messages
    When OpenClaw gateway restarts
    Then the messages are still in inbox JSONL file
    And researcher can read them after restart

  Scenario: Messages cleared only after successful read
    Given researcher has 1 message in inbox
    When researcher's context injection fails
    Then the message is NOT cleared from inbox
    And the message can be re-delivered on next wake
```

## Feature: Team Lead Skill

### Scenario: Coordinate team workflow

```gherkin
Feature: Team Lead Workflow

  Scenario: Full delegation workflow
    Given I am the team lead
    When I receive a complex task
    Then I should:
      1. Create a team with descriptive name
      2. Break down the task into subtasks
      3. Spawn teammates for each subtask type
      4. Create tasks in the ledger
      5. Send assignment messages to teammates
      6. Monitor inbox for completion notifications
      7. Aggregate results
      8. Shutdown team when complete

  Scenario: Handle teammate failure
    Given a teammate reports an error
    When I receive the error message
    Then I should:
      1. Assess if the task can be reassigned
      2. Send guidance to the teammate
      3. Or spawn a new teammate with different capabilities

  Scenario: Task dependency management
    Given task B depends on task A
    When task A is completed
    Then I should:
      1. Notify the owner of task B
      2. Verify task B is now unblocked
      3. Confirm task B can be claimed
```

## Testing Strategy

### Unit Tests

- Each tool tested in isolation with mock dependencies
- SQLite ledger operations with in-memory database
- JSONL mailbox with temp files
- Type validation for all parameters

### Integration Tests

- Team creation → teammate spawn → task workflow
- Message sending → inbox reading
- Task claiming → completion → dependency unblocking

### E2E Tests

- Full team lifecycle (create → work → shutdown)
- Multiple teammates working in parallel
- Error recovery scenarios