import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createInboxTool } from "../../src/tools/inbox.js";
import { createTeamDirectory } from "../../src/storage.js";

interface InboxResponse {
  messages: Array<{
    id: string;
    from: string;
    content: string;
    summary?: string;
    timestamp: number;
  }>;
}

interface ToolError {
  error: {
    code: string;
    message: string;
  };
}

interface SessionContext {
  teamsDir: string;
  teamName: string;
  teammateName: string;
}

describe("inbox tool", () => {
  let tempDir: string;
  let ctx: SessionContext;

  beforeEach(async () => {
    tempDir = join(process.cwd(), "test-temp", `inbox-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
    await createTeamDirectory(tempDir, "test-team");
    ctx = {
      teamsDir: tempDir,
      teamName: "test-team",
      teammateName: "researcher",
    };

    // Create inbox directory for researcher
    await mkdir(join(tempDir, "test-team", "inbox", "researcher"), { recursive: true });
  });

  afterEach(async () => {
    await rm(join(process.cwd(), "test-temp"), { recursive: true, force: true });
  });

  describe("Given a teammate with unread messages", () => {
    beforeEach(async () => {
      const inboxPath = join(tempDir, "test-team", "inbox", "researcher", "messages.jsonl");
      const messages = [
        {
          id: "msg-1",
          from: "lead",
          to: "researcher",
          content: "First message",
          summary: "Summary 1",
          timestamp: Date.now() - 3000,
        },
        {
          id: "msg-2",
          from: "coder",
          to: "researcher",
          content: "Second message",
          summary: "Summary 2",
          timestamp: Date.now() - 2000,
        },
        {
          id: "msg-3",
          from: "lead",
          to: "researcher",
          content: "Third message",
          summary: "Summary 3",
          timestamp: Date.now() - 1000,
        },
      ];

      const jsonlContent = messages.map((m) => JSON.stringify(m)).join("\n");
      await writeFile(inboxPath, jsonlContent);
    });

    describe("When reading messages without clear", () => {
      it("Then should return messages in chronological order", async () => {
        const tool = createInboxTool(ctx);
        const result = (await tool.handler({})) as InboxResponse;

        expect(result.messages.length).toBe(3);
        expect(result.messages[0].id).toBe("msg-1");
        expect(result.messages[1].id).toBe("msg-2");
        expect(result.messages[2].id).toBe("msg-3");
      });

      it("Then each message should have required fields", async () => {
        const tool = createInboxTool(ctx);
        const result = (await tool.handler({})) as InboxResponse;

        for (const message of result.messages) {
          expect(message).toHaveProperty("id");
          expect(message).toHaveProperty("from");
          expect(message).toHaveProperty("content");
          expect(message).toHaveProperty("timestamp");
        }
      });

      it("Then messages should remain in inbox", async () => {
        const tool = createInboxTool(ctx);
        await tool.handler({});

        const inboxPath = join(tempDir, "test-team", "inbox", "researcher", "messages.jsonl");
        const content = await readFile(inboxPath, "utf-8");
        const lines = content.trim().split("\n");
        expect(lines.length).toBe(3);
      });
    });

    describe("When reading messages with clear option", () => {
      it("Then should return messages and clear inbox", async () => {
        const tool = createInboxTool(ctx);
        const result = (await tool.handler({ clear: true })) as InboxResponse;

        expect(result.messages.length).toBe(3);

        // Verify inbox is cleared
        const inboxPath = join(tempDir, "test-team", "inbox", "researcher", "messages.jsonl");
        const content = await readFile(inboxPath, "utf-8");
        expect(content.trim()).toBe("");
      });
    });

    describe("When limiting message count", () => {
      it("Then should return only N most recent messages", async () => {
        const tool = createInboxTool(ctx);
        const result = (await tool.handler({ limit: 2 })) as InboxResponse;

        expect(result.messages.length).toBe(2);
        // Should get the 2 most recent
        expect(result.messages[0].id).toBe("msg-2");
        expect(result.messages[1].id).toBe("msg-3");
      });
    });
  });

  describe("Given an empty inbox", () => {
    it("Then should return empty messages array", async () => {
      const tool = createInboxTool(ctx);
      const result = (await tool.handler({})) as InboxResponse;

      expect(result.messages).toEqual([]);
    });
  });

  describe("Given a non-teammate session", () => {
    it("Then should return error", async () => {
      const nonTeammateCtx: SessionContext = {
        teamsDir: tempDir,
        teamName: "test-team",
        teammateName: "", // Empty means not a teammate
      };

      const tool = createInboxTool(nonTeammateCtx);
      const result = (await tool.handler({})) as ToolError;

      expect(result).toHaveProperty("error");
      expect(result.error.code).toBe("NOT_TEAMMATE");
    });
  });

  describe("Tool schema", () => {
    it("should have correct tool name", () => {
      const tool = createInboxTool(ctx);
      expect(tool.name).toBe("inbox");
    });

    it("should have description", () => {
      const tool = createInboxTool(ctx);
      expect(tool.description).toBeDefined();
      expect(tool.description.length).toBeGreaterThan(0);
    });
  });
});
