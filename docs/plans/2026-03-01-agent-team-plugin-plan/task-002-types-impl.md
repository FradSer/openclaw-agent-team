# Task 002: Types Module Impl

## Summary

Implement the type definitions module with TypeScript interfaces and TypeBox schemas for runtime validation.

## BDD Scenario

```gherkin
Feature: Type Definitions Implementation

  Scenario: Types module exports all interfaces
    Given the types module is implemented
    When I import from src/types.ts
    Then TeamConfig interface is exported
    And TeammateDefinition interface is exported
    And Task interface is exported
    And TeamMessage interface is exported
    And all TypeBox schemas are exported

  Scenario: TypeBox schemas match interfaces
    Given the types module is implemented
    When I validate a TeamConfig object with TeamConfigSchema
    Then it returns valid for correct objects
    And it returns invalid for malformed objects
```

## What to Implement

Create `src/types.ts` with:

1. **TeamConfig interface**:
   - id: string (UUID)
   - team_name: string
   - description?: string
   - agent_type: string
   - lead: string
   - metadata: { createdAt: number, updatedAt: number, status: "active" | "shutdown" }

2. **TeammateDefinition interface**:
   - name: string
   - agentId: string
   - sessionKey: string
   - agentType: string
   - model?: string
   - tools?: { allow?: string[], deny?: string[] }
   - status: "idle" | "working" | "error" | "shutdown"
   - joinedAt: number

3. **Task interface**:
   - id: string (UUID)
   - subject: string
   - description: string
   - activeForm?: string
   - status: "pending" | "in_progress" | "completed" | "failed" | "blocked"
   - owner?: string
   - blockedBy: string[]
   - createdAt: number
   - claimedAt?: number
   - completedAt?: number

4. **TeamMessage interface**:
   - id: string
   - from: string
   - to?: string
   - type: "message" | "broadcast" | "task_update" | "shutdown_request"
   - content: string
   - summary?: string
   - timestamp: number

5. **TypeBox schemas** for runtime validation of each interface

6. **Plugin configuration types**:
   - AgentTeamConfig with maxTeammatesPerTeam, defaultAgentType, etc.

## Verification

```bash
# Run types tests (should PASS)
cd packages/openclaw-agent-team && pnpm vitest run tests/types.test.ts

# Verify TypeScript compilation
cd packages/openclaw-agent-team && pnpm tsc --noEmit
```

## Files to Create

- `src/types.ts`

## depends-on

- [Task 002: Types Module Test](./task-002-types-test.md)
