# Task 003: Storage Module Impl

## Summary

Implement the storage module for team directory management, config file handling, and path resolution with security validation.

## BDD Scenario

```gherkin
Feature: Storage Module Implementation

  Scenario: All storage functions are exported
    Given the storage module is implemented
    When I import from src/storage.ts
    Then getTeamsBaseDir is exported
    And createTeamDirectory is exported
    And teamDirectoryExists is exported
    And validateTeamName is exported
    And writeTeamConfig is exported
    And readTeamConfig is exported
    And resolveTeammatePaths is exported
    And sanitizeTeammateName is exported
```

## What to Implement

Create `src/storage.ts` with:

1. **Constants**:
   - `TEAM_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,50}$/`
   - `TEAMMATE_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/`

2. **validateTeamName(name: string): boolean**:
   - Check name matches pattern
   - Check length is 1-50 characters
   - Reject path separators

3. **sanitizeTeammateName(name: string): string**:
   - Convert to lowercase
   - Replace invalid characters with hyphens
   - Truncate to 100 characters

4. **createTeamDirectory(teamsDir: string, teamName: string): Promise<void>**:
   - Validate team name
   - Create directory structure:
     - `{teamName}/`
     - `{teamName}/config.json`
     - `{teamName}/ledger.db`
     - `{teamName}/inbox/`
     - `{teamName}/agents/`
   - Set restrictive permissions (0o700 for dirs, 0o600 for files)

5. **teamDirectoryExists(teamsDir: string, teamName: string): Promise<boolean>**:
   - Check if directory and config.json exist

6. **writeTeamConfig(teamsDir: string, teamName: string, config: TeamConfig): Promise<void>**:
   - Write config.json with restrictive permissions

7. **readTeamConfig(teamsDir: string, teamName: string): Promise<TeamConfig | null>**:
   - Read and parse config.json
   - Return null if not found

8. **resolveTeammatePaths(teamsDir: string, teamName: string, teammateName: string)**:
   - Return workspace, agentDir, inboxPath

9. **resolveTeamPath(teamsDir: string, teamName: string, ...segments: string[]): string**:
   - Validate no path traversal
   - Ensure resolved path is within teamsDir

10. **getTeamsBaseDir(): string**:
    - Return `~/.openclaw/teams/` or from config

## Verification

```bash
# Run storage tests (should PASS)
cd packages/openclaw-agent-team && pnpm vitest run tests/storage.test.ts

# Verify TypeScript compilation
cd packages/openclaw-agent-team && pnpm tsc --noEmit
```

## Files to Create

- `src/storage.ts`

## depends-on

- [Task 003: Storage Module Test](./task-003-storage-test.md)
