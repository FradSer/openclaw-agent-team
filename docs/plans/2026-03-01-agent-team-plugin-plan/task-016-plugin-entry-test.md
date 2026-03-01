# Task 016: Plugin Entry Point Test

## Summary

Write failing tests for the plugin entry point that registers all tools, services, and hooks with OpenClaw.

## BDD Scenario

```gherkin
Feature: Plugin Registration

  Scenario: Plugin registers all tools
    Given the plugin is loaded
    When the register function is called
    Then team_create tool is registered
    And team_shutdown tool is registered
    And teammate_spawn tool is registered
    And task_create tool is registered
    And task_list tool is registered
    And task_claim tool is registered
    And task_complete tool is registered
    And send_message tool is registered
    And inbox tool is registered

  Scenario: Plugin registers context injection hook
    Given the plugin is loaded
    When the register function is called
    Then before_prompt_build hook is registered
    And the hook calls handleBeforePromptBuild

  Scenario: Plugin manifest is valid
    Given the openclaw.plugin.json file
    When I parse the manifest
    Then the id is "agent-team"
    And the name is "Agent Team"
    And the configSchema is valid JSON Schema
```

## What to Test

Create `tests/index.test.ts` that:

1. Tests plugin object has correct id and name
2. Tests register function exists
3. Tests register calls api.registerTool for each tool
4. Tests register calls api.on for before_prompt_build hook
5. Tests plugin context is created correctly
6. Tests manifest file is valid JSON
7. Tests manifest has required fields
8. Uses mock OpenClawPluginApi

## Verification

```bash
# Run plugin entry tests (should FAIL initially)
cd packages/openclaw-agent-team && pnpm vitest run tests/index.test.ts

# Expected: Tests fail because index.ts does not exist yet
```

## Files to Create

- `tests/index.test.ts`

## depends-on

- [Task 005: Team Create Impl](./task-005-team-create-impl.md)
- [Task 006: Team Shutdown Impl](./task-006-team-shutdown-impl.md)
- [Task 007: Teammate Spawn Impl](./task-007-teammate-spawn-impl.md)
- [Task 008: Task Create Impl](./task-008-task-create-impl.md)
- [Task 009: Task List Impl](./task-009-task-list-impl.md)
- [Task 010: Task Claim Impl](./task-010-task-claim-impl.md)
- [Task 011: Task Complete Impl](./task-011-task-complete-impl.md)
- [Task 013: Send Message Impl](./task-013-send-message-impl.md)
- [Task 014: Inbox Impl](./task-014-inbox-impl.md)
- [Task 015: Context Injection Impl](./task-015-context-injection-impl.md)
