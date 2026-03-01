# Task 016: Plugin Entry Point Impl

## Summary

Implement the plugin entry point that registers all tools, services, and hooks with OpenClaw.

## BDD Scenario

```gherkin
Feature: Plugin Entry Point Implementation

  Scenario: Plugin exports default object
    Given the index.ts module is implemented
    When I import the module
    Then a default export exists with:
      | id          | agent-team                      |
      | name        | Agent Team                      |
      | description | Multi-agent team coordination   |
      | configSchema | AgentTeamConfigSchema          |
      | register    | async function                  |
```

## What to Implement

1. Create `openclaw.plugin.json`:
   ```json
   {
     "id": "agent-team",
     "name": "Agent Team",
     "description": "Multi-agent team coordination with shared task ledger",
     "version": "1.0.0",
     "main": "dist/index.js",
     "configSchema": { ... }
   }
   ```

2. Create `src/tools/register.ts`:
   - `registerTeamTools(api, ctx)`: Register all tools
   - Import and create each tool

3. Update `src/index.ts`:
   - Create plugin context
   - Register all tools via registerTeamTools
   - Register before_prompt_build hook
   - Log successful registration
   - Export default plugin object

4. **Plugin object structure**:
   ```typescript
   const agentTeamPlugin = {
     id: "agent-team",
     name: "Agent Team",
     description: "Multi-agent team coordination with shared task ledger",
     configSchema: AgentTeamConfigSchema,

     async register(api: OpenClawPluginApi) {
       const ctx = createPluginContext(api);

       // Register tools
       registerTeamTools(api, ctx);

       // Register context injection hook
       api.on("before_prompt_build", async (event, ctx) => {
         return handleBeforePromptBuild(event, ctx);
       });

       api.logger.info("[agent-team] Plugin registered");
     },
   };

   export default agentTeamPlugin;
   ```

5. **Create plugin context**:
   - `createPluginContext(api)`: Build context object with:
     - teamsDir
     - config (plugin config)
     - api reference
     - logger

## Verification

```bash
# Run plugin entry tests (should PASS)
cd packages/openclaw-agent-team && pnpm vitest run tests/index.test.ts

# Verify TypeScript compilation
cd packages/openclaw-agent-team && pnpm tsc --noEmit

# Verify plugin can be loaded
cd packages/openclaw-agent-team && pnpm build
```

## Files to Create

- `openclaw.plugin.json`
- `src/tools/register.ts`
- Update `src/index.ts`

## depends-on

- [Task 016: Plugin Entry Point Test](./task-016-plugin-entry-test.md)
