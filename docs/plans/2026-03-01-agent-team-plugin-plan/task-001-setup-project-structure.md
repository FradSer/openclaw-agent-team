# Task 001: Setup Project Structure

## Summary

Initialize the `@fradser/openclaw-agent-team` package with proper TypeScript configuration, test framework, and directory structure.

## BDD Scenario

```gherkin
Feature: Project Setup

  Scenario: Package structure is valid
    Given I navigate to the packages directory
    When I create the openclaw-agent-team package
    Then the package.json exists with name "@fradser/openclaw-agent-team"
    And the tsconfig.json exists with strict mode enabled
    And the vitest.config.ts exists
    And the src/ directory exists
    And the tests/ directory exists
```

## What to Implement

1. Create package directory at `packages/openclaw-agent-team/`
2. Create `package.json` with:
   - Name: `@fradser/openclaw-agent-team`
   - Dependencies: `better-sqlite3`, `@sinclair/typebox`
   - Dev dependencies: `typescript`, `vitest`, `@types/better-sqlite3`
   - Scripts: `build`, `test`, `test:watch`
3. Create `tsconfig.json` with strict mode and ESM output
4. Create `vitest.config.ts` for test configuration
5. Create directory structure:
   - `src/` - source files
   - `src/tools/` - tool implementations
   - `tests/` - test files
   - `skills/` - team-lead skill

## Verification

```bash
# Verify package structure
ls -la packages/openclaw-agent-team/

# Verify TypeScript compiles
cd packages/openclaw-agent-team && pnpm tsc --noEmit

# Verify test framework works
cd packages/openclaw-agent-team && pnpm vitest run
```

## Files to Create

```
packages/openclaw-agent-team/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   └── index.ts (empty)
└── tests/
    └── setup.test.ts (placeholder test)
```

## depends-on

None (first task)
