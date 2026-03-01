# Task 007: Teammate Spawn Impl

## Summary

Implement the teammate_spawn tool and spawner module that creates full agent instances with isolated workspaces.

## BDD Scenario

```gherkin
Feature: Teammate Spawning Implementation

  Scenario: teammate_spawn tool is properly registered
    Given the teammate-spawn module is implemented
    When I import from src/tools/teammate-spawn.ts
    Then createTeammateSpawnTool function is exported
    And it returns an AnyAgentTool with:
      | label     | Teammate Spawn       |
      | name      | teammate_spawn       |
      | parameters | TeammateSpawnSchema |
```

## What to Implement

1. Create `src/teammate-spawner.ts` with:

   - **spawnTeammateAgent(params)** function:
     - Generate agentId: `teammate-{teamName}-{sanitizedName}`
     - Generate sessionKey: `agent:{agentId}:main`
     - Create workspace and agentDir directories
     - Build agent config with workspace, agentDir, model, tools
     - Call `runtime.config.writeConfigFile()` to add agent
     - Return { agentId, sessionKey }

2. Create `src/tools/teammate-spawn.ts` with:

   - **TeammateSpawnSchema** (TypeBox):
     - team_name: string (required)
     - name: string (required, sanitized)
     - agent_type: string (optional, default from config)
     - model: string (optional)
     - tools: object with allow/deny arrays (optional)

   - **createTeammateSpawnTool(ctx)** function that returns `AnyAgentTool`:
     - label: "Teammate Spawn"
     - name: "teammate_spawn"
     - description: "Creates a new teammate agent with isolated workspace"
     - parameters: TeammateSpawnSchema
     - execute: async handler that:
       - Validates team exists and is active
       - Checks teammate count against maxTeammatesPerTeam
       - Sanitizes teammate name
       - Calls spawnTeammateAgent
       - Adds teammate to ledger
       - Returns { teammateId, sessionKey, status }

3. **Error handling**:
   - Team not found -> not_found error
   - Team not active -> conflict error
   - At capacity -> conflict error
   - Invalid name -> validation error

4. **Response format**:
   ```typescript
   {
     teammateId: string;  // agentId
     sessionKey: string;
     status: "spawned";
   }
   ```

## Verification

```bash
# Run teammate_spawn tests (should PASS)
cd packages/openclaw-agent-team && pnpm vitest run tests/tools/teammate-spawn.test.ts

# Verify TypeScript compilation
cd packages/openclaw-agent-team && pnpm tsc --noEmit
```

## Files to Create

- `src/teammate-spawner.ts`
- `src/tools/teammate-spawn.ts`

## depends-on

- [Task 007: Teammate Spawn Test](./task-007-teammate-spawn-test.md)
