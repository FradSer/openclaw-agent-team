# Task 015: Context Injection Impl

## Summary

Implement the context injection hook that delivers messages to teammates via the before_prompt_build hook.

## BDD Scenario

```gherkin
Feature: Context Injection Implementation

  Scenario: Hook handler is exported
    Given the context-injection module is implemented
    When I import from src/context-injection.ts
    Then handleBeforePromptBuild function is exported
    And it returns prependContext with XML messages
```

## What to Implement

Create `src/context-injection.ts` with:

1. **Helper functions**:
   - `parseTeamFromAgentId(agentId)`: Extract team and teammate name from agentId
     - Format: "teammate-{teamName}-{teammateName}"
     - Returns null if not a teammate
   - `escapeXml(text)`: Escape special XML characters
   - `messageToXml(msg)`: Convert message to XML format

2. **handleBeforePromptBuild(event, ctx)** function:
   - Check if agentId starts with "teammate-"
   - Parse team info from agentId
   - Read pending messages from inbox
   - Convert messages to XML format
   - Clear inbox ONLY after successful injection
   - Return { prependContext: xmlString }
   - Handle errors gracefully (don't clear inbox on failure)

3. **XML message format**:
   ```xml
   <teammate-message from="sender" type="message" summary="Brief summary">
     Message content here
   </teammate-message>
   ```

4. **Integration with plugin**:
   - Export function to be registered as hook handler
   - Handle errors gracefully (log but don't throw)

## Verification

```bash
# Run context injection tests (should PASS)
cd packages/openclaw-agent-team && pnpm vitest run tests/context-injection.test.ts

# Verify TypeScript compilation
cd packages/openclaw-agent-team && pnpm tsc --noEmit
```

## Files to Create

- `src/context-injection.ts`

## depends-on

- [Task 015: Context Injection Test](./task-015-context-injection-test.md)
