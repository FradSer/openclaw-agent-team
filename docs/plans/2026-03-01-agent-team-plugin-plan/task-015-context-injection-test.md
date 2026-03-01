# Task 015: Context Injection Test

## Summary

Write failing tests for the context injection hook that delivers messages to teammates via heartbeat wake.

## BDD Scenario

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

  Scenario: Teammate not in team has no context injection
    Given agent session is not a teammate (no "teammate-" prefix)
    When before_prompt_build hook fires
    Then no inbox messages are read
    And empty prependContext is returned

  Scenario: Heartbeat coalescing
    Given team lead sends 5 messages rapidly to researcher
    Then only 1 heartbeat wake is scheduled
    And researcher processes all 5 messages in one wake cycle

  Scenario: Messages cleared only after successful injection
    Given researcher has 1 message in inbox
    When researcher's context injection fails
    Then the message is NOT cleared from inbox
    And the message can be re-delivered on next wake
```

## What to Test

Create `tests/context-injection.test.ts` that:

1. Tests hook only processes teammate sessions
2. Tests messages are read from inbox
3. Tests messages are converted to XML format
4. Tests prependContext contains XML messages
5. Tests multiple messages are batched
6. Tests inbox is cleared after successful injection
7. Tests non-teammate sessions return empty
8. Tests XML escaping for special characters
9. Tests heartbeat coalescing (multiple messages processed in one wake)
10. Tests messages are NOT cleared when injection fails
11. Uses mock mailbox and hook context

## Verification

```bash
# Run context injection tests (should FAIL initially)
cd packages/openclaw-agent-team && pnpm vitest run tests/context-injection.test.ts

# Expected: Tests fail because context-injection.ts does not exist yet
```

## Files to Create

- `tests/context-injection.test.ts`

## depends-on

- [Task 012: Mailbox Module Impl](./task-012-mailbox-impl.md)
