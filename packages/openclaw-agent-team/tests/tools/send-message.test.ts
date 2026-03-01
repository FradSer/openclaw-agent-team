import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createSendMessageTool } from "../../src/tools/send-message.js";
import { createTeamDirectory } from "../../src/storage.js";
import { TeamLedger } from "../../src/ledger.js";

interface SendMessageResponse {
  messageId: string;
  recipient: string;
  delivered: boolean;
}

interface ToolError {
  error: {
    code: string;
    message: string;
  };
}

interface PluginContext {
  teamsDir: string;
}

describe("send_message tool", () => {
  let tempDir: string;
  let ctx: PluginContext;
  let ledger: TeamLedger;

  beforeEach(async () => {
    tempDir = join(process.cwd(), "test-temp", `send-message-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
    ctx = {
      teamsDir: tempDir,
    };
  });

  afterEach(async () => {
    if (ledger) {
      ledger.close();
    }
    await rm(join(process.cwd(), "test-temp"), { recursive: true, force: true });
  });

  describe("Given a team with teammates", () => {
    beforeEach(async () => {
      await createTeamDirectory(tempDir, "test-team");
      ledger = new TeamLedger(join(tempDir, "test-team", "ledger.db"));

      // Add teammates to the ledger
      await ledger.addMember({
        name: "researcher",
        agentId: "teammate-test-team-researcher",
        sessionKey: "agent:teammate-test-team-researcher:main",
        agentType: "Explore",
        status: "idle",
        joinedAt: Date.now(),
      });

      await ledger.addMember({
        name: "coder",
        agentId: "teammate-test-team-coder",
        sessionKey: "agent:teammate-test-team-coder:main",
        agentType: "general-purpose",
        status: "idle",
        joinedAt: Date.now(),
      });

      await ledger.addMember({
        name: "reviewer",
        agentId: "teammate-test-team-reviewer",
        sessionKey: "agent:teammate-test-team-reviewer:main",
        agentType: "review",
        status: "idle",
        joinedAt: Date.now(),
      });

      // Create inbox directories
      await mkdir(join(tempDir, "test-team", "inbox", "researcher"), { recursive: true });
      await mkdir(join(tempDir, "test-team", "inbox", "coder"), { recursive: true });
      await mkdir(join(tempDir, "test-team", "inbox", "reviewer"), { recursive: true });
    });

    describe("When sending a direct message to a teammate", () => {
      it("Then should append message to recipient inbox", async () => {
        const tool = createSendMessageTool(ctx, "test-team", "lead", ledger);
        const result = (await tool.handler({
          type: "message",
          recipient: "researcher",
          content: "Focus on the API design",
          summary: "Task assignment",
        })) as SendMessageResponse;

        expect(result).toHaveProperty("messageId");
        expect(result).toHaveProperty("recipient");
        expect(result.recipient).toBe("researcher");
        expect(result.delivered).toBe(true);

        // Verify message was written to inbox
        const inboxPath = join(tempDir, "test-team", "inbox", "researcher", "messages.jsonl");
        const content = await readFile(inboxPath, "utf-8");
        const lines = content.trim().split("\n");
        expect(lines.length).toBe(1);

        const message = JSON.parse(lines[0]);
        expect(message.from).toBe("lead");
        expect(message.to).toBe("researcher");
        expect(message.content).toBe("Focus on the API design");
        expect(message.summary).toBe("Task assignment");
        expect(message.id).toBeDefined();
        expect(message.timestamp).toBeDefined();
      });

      it("Then should store message with correct metadata", async () => {
        const tool = createSendMessageTool(ctx, "test-team", "lead", ledger);
        const result = (await tool.handler({
          type: "message",
          recipient: "researcher",
          content: "Hello",
          summary: "Greeting",
        })) as SendMessageResponse;

        expect(result.delivered).toBe(true);

        // Verify message was stored with correct metadata
        const inboxPath = join(tempDir, "test-team", "inbox", "researcher", "messages.jsonl");
        const content = await readFile(inboxPath, "utf-8");
        const message = JSON.parse(content.trim());

        expect(message.id).toBeDefined();
        expect(message.timestamp).toBeGreaterThan(0);
        expect(message.type).toBe("message");
      });
    });

    describe("When sending message to non-existent teammate", () => {
      it("Then should return RECIPIENT_NOT_FOUND error", async () => {
        const tool = createSendMessageTool(ctx, "test-team", "lead", ledger);
        const result = (await tool.handler({
          type: "message",
          recipient: "unknown-teammate",
          content: "Hello",
          summary: "Greeting",  // 8 chars, meets minimum of 5
        })) as ToolError;

        expect(result).toHaveProperty("error");
        expect(result.error.code).toBe("RECIPIENT_NOT_FOUND");
        expect(result.error.message).toContain("not found");
      });
    });

    describe("When broadcasting to all teammates", () => {
      it("Then should send message to all active teammates", async () => {
        const tool = createSendMessageTool(ctx, "test-team", "lead", ledger);
        const result = (await tool.handler({
          type: "broadcast",
          content: "Team announcement",
          summary: "Important update",
        })) as { delivered: number; recipients: string[] };

        expect(result.delivered).toBe(3);
        expect(result.recipients).toContain("researcher");
        expect(result.recipients).toContain("coder");
        expect(result.recipients).toContain("reviewer");

        // Verify each inbox received the message
        const researcherInbox = await readFile(
          join(tempDir, "test-team", "inbox", "researcher", "messages.jsonl"),
          "utf-8"
        );
        const coderInbox = await readFile(
          join(tempDir, "test-team", "inbox", "coder", "messages.jsonl"),
          "utf-8"
        );
        expect(JSON.parse(researcherInbox).content).toBe("Team announcement");
        expect(JSON.parse(coderInbox).content).toBe("Team announcement");
      });

      it("Then should deliver broadcast to all inbox files", async () => {
        const tool = createSendMessageTool(ctx, "test-team", "lead", ledger);
        await tool.handler({
          type: "broadcast",
          content: "Team announcement",
          summary: "Important update",
        });

        // Verify each inbox received the broadcast message
        const researcherInbox = await readFile(
          join(tempDir, "test-team", "inbox", "researcher", "messages.jsonl"),
          "utf-8"
        );
        const coderInbox = await readFile(
          join(tempDir, "test-team", "inbox", "coder", "messages.jsonl"),
          "utf-8"
        );
        const reviewerInbox = await readFile(
          join(tempDir, "test-team", "inbox", "reviewer", "messages.jsonl"),
          "utf-8"
        );

        expect(JSON.parse(researcherInbox).type).toBe("broadcast");
        expect(JSON.parse(coderInbox).type).toBe("broadcast");
        expect(JSON.parse(reviewerInbox).type).toBe("broadcast");
      });
    });

    describe("When message exceeds size limit", () => {
      it("Then should return MESSAGE_TOO_LARGE error", async () => {
        const tool = createSendMessageTool(ctx, "test-team", "lead", ledger);
        const largeContent = "x".repeat(102401); // 100KB + 1 byte

        const result = (await tool.handler({
          type: "message",
          recipient: "researcher",
          content: largeContent,
          summary: "Large message",
        })) as ToolError;

        expect(result).toHaveProperty("error");
        expect(result.error.code).toBe("MESSAGE_TOO_LARGE");
        expect(result.error.message).toMatch(/too large|exceed/i);
      });
    });
  });

  describe("Tool schema", () => {
    it("should have correct tool name", () => {
      const tool = createSendMessageTool(ctx, "test-team", "lead", ledger);
      expect(tool.name).toBe("send_message");
    });

    it("should have description", () => {
      const tool = createSendMessageTool(ctx, "test-team", "lead", ledger);
      expect(tool.description).toBeDefined();
      expect(tool.description.length).toBeGreaterThan(0);
    });
  });
});
