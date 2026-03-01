import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createContextInjectionHook } from "../src/context-injection.js";
import { createTeamDirectory } from "../src/storage.js";
import type { TeamMessage } from "../src/types.js";

interface HookContext {
  sessionKey: string;
  teamsDir: string;
  teamName: string;
  teammateName: string;
}

interface HookResult {
  prependContext?: string;
}

describe("Context Injection Hook", () => {
  let tempDir: string;
  let hookCtx: HookContext;

  beforeEach(async () => {
    tempDir = join(process.cwd(), "test-temp", `context-injection-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
    await createTeamDirectory(tempDir, "test-team");

    hookCtx = {
      sessionKey: "agent:teammate-test-team-researcher:main",
      teamsDir: tempDir,
      teamName: "test-team",
      teammateName: "researcher",
    };

    // Create inbox directory
    await mkdir(join(tempDir, "test-team", "inbox", "researcher"), { recursive: true });
  });

  afterEach(async () => {
    await rm(join(process.cwd(), "test-temp"), { recursive: true, force: true });
  });

  describe("Given a teammate with pending messages", () => {
    beforeEach(async () => {
      const inboxPath = join(tempDir, "test-team", "inbox", "researcher", "messages.jsonl");
      const messages: TeamMessage[] = [
        {
          id: "msg-1",
          from: "lead",
          to: "researcher",
          type: "message",
          content: "Focus on the API",
          summary: "Task assignment",
          timestamp: Date.now() - 3000,
        },
        {
          id: "msg-2",
          from: "coder",
          to: "researcher",
          type: "message",
          content: "PR is ready for review",
          summary: "Review request",
          timestamp: Date.now() - 2000,
        },
        {
          id: "msg-3",
          from: "lead",
          to: "researcher",
          type: "broadcast",
          content: "Team meeting at 3pm",
          summary: "Meeting announcement",
          timestamp: Date.now() - 1000,
        },
      ];

      const jsonlContent = messages.map((m) => JSON.stringify(m)).join("\n");
      await writeFile(inboxPath, jsonlContent);
    });

    describe("When before_prompt_build hook fires", () => {
      it("Then should read messages from inbox", async () => {
        const hook = createContextInjectionHook(hookCtx);
        const result = (await hook()) as HookResult;

        expect(result.prependContext).toBeDefined();
        expect(result.prependContext).toContain("Focus on the API");
        expect(result.prependContext).toContain("PR is ready for review");
        expect(result.prependContext).toContain("Team meeting at 3pm");
      });

      it("Then should convert messages to XML format", async () => {
        const hook = createContextInjectionHook(hookCtx);
        const result = (await hook()) as HookResult;

        expect(result.prependContext).toContain("<teammate-message");
        expect(result.prependContext).toContain('from="lead"');
        expect(result.prependContext).toContain('from="coder"');
        expect(result.prependContext).toContain("</teammate-message>");
      });

      it("Then should include message attributes in XML", async () => {
        const hook = createContextInjectionHook(hookCtx);
        const result = (await hook()) as HookResult;

        expect(result.prependContext).toContain('type="message"');
        expect(result.prependContext).toContain('summary="Task assignment"');
        expect(result.prependContext).toContain('summary="Review request"');
      });

      it("Then should batch all messages in one context block", async () => {
        const hook = createContextInjectionHook(hookCtx);
        const result = (await hook()) as HookResult;

        const messageCount = (result.prependContext?.match(/<teammate-message/g) || []).length;
        expect(messageCount).toBe(3);
      });
    });

    describe("When clearAfterRead is true", () => {
      it("Then should clear inbox after successful injection", async () => {
        const hook = createContextInjectionHook(hookCtx, { clearAfterRead: true });
        await hook();

        const inboxPath = join(tempDir, "test-team", "inbox", "researcher", "messages.jsonl");
        const content = await readFile(inboxPath, "utf-8");
        expect(content.trim()).toBe("");
      });
    });

    describe("When clearAfterRead is false", () => {
      it("Then should NOT clear inbox", async () => {
        const hook = createContextInjectionHook(hookCtx, { clearAfterRead: false });
        await hook();

        const inboxPath = join(tempDir, "test-team", "inbox", "researcher", "messages.jsonl");
        const content = await readFile(inboxPath, "utf-8");
        const lines = content.trim().split("\n");
        expect(lines.length).toBe(3);
      });
    });
  });

  describe("Given a message with special characters", () => {
    beforeEach(async () => {
      const inboxPath = join(tempDir, "test-team", "inbox", "researcher", "messages.jsonl");
      const message: TeamMessage = {
        id: "msg-special",
        from: "lead",
        to: "researcher",
        type: "message",
        content: "Use <xml> & \"quotes\" properly",
        summary: "Test & verify",
        timestamp: Date.now(),
      };

      await writeFile(inboxPath, JSON.stringify(message));
    });

    it("Then should escape XML special characters", async () => {
      const hook = createContextInjectionHook(hookCtx);
      const result = (await hook()) as HookResult;

      expect(result.prependContext).toContain("&lt;xml&gt;");
      expect(result.prependContext).toContain("&amp;");
      expect(result.prependContext).toContain("&quot;");
    });
  });

  describe("Given an empty inbox", () => {
    it("Then should return empty prependContext", async () => {
      const hook = createContextInjectionHook(hookCtx);
      const result = (await hook()) as HookResult;

      expect(result.prependContext).toBe("");
    });
  });

  describe("Given a non-teammate session", () => {
    it("Then should not process messages", async () => {
      const nonTeammateCtx: HookContext = {
        sessionKey: "agent:main", // No teammate- prefix
        teamsDir: tempDir,
        teamName: "",
        teammateName: "",
      };

      const hook = createContextInjectionHook(nonTeammateCtx);
      const result = (await hook()) as HookResult;

      expect(result.prependContext).toBe("");
    });
  });

  describe("Given multiple messages sent rapidly", () => {
    beforeEach(async () => {
      const inboxPath = join(tempDir, "test-team", "inbox", "researcher", "messages.jsonl");
      const messages: TeamMessage[] = [];

      for (let i = 0; i < 5; i++) {
        messages.push({
          id: `msg-${i}`,
          from: "lead",
          to: "researcher",
          type: "message",
          content: `Message ${i}`,
          summary: `Summary ${i}`,
          timestamp: Date.now() + i,
        });
      }

      const jsonlContent = messages.map((m) => JSON.stringify(m)).join("\n");
      await writeFile(inboxPath, jsonlContent);
    });

    it("Then should process all messages in one wake cycle", async () => {
      const hook = createContextInjectionHook(hookCtx);
      const result = (await hook()) as HookResult;

      const messageCount = (result.prependContext?.match(/<teammate-message/g) || []).length;
      expect(messageCount).toBe(5);
    });
  });

  describe("Given injection fails", () => {
    beforeEach(async () => {
      const inboxPath = join(tempDir, "test-team", "inbox", "researcher", "messages.jsonl");
      const messages: TeamMessage[] = [
        {
          id: "msg-fail-1",
          from: "lead",
          to: "researcher",
          type: "message",
          content: "This should persist",
          summary: "Test message",
          timestamp: Date.now(),
        },
      ];

      const jsonlContent = messages.map((m) => JSON.stringify(m)).join("\n");
      await writeFile(inboxPath, jsonlContent);
    });

    it("Then should NOT clear messages from inbox", async () => {
      // Create a hook that will fail
      const hook = createContextInjectionHook(hookCtx, {
        clearAfterRead: true,
        shouldFail: true, // Simulate failure
      });

      try {
        await hook();
      } catch {
        // Expected to fail
      }

      // Messages should still be in inbox
      const inboxPath = join(tempDir, "test-team", "inbox", "researcher", "messages.jsonl");
      const content = await readFile(inboxPath, "utf-8");
      expect(content.trim().length).toBeGreaterThan(0);
    });
  });
});
