import { mkdir, readFile, unlink, readdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { TeamMessage } from "./types.js";

export const MAX_MESSAGE_SIZE = 100 * 1024; // 100KB

const VALID_MESSAGE_TYPES = ["message", "broadcast", "task_update", "shutdown_request"] as const;

interface DirectMessageParams {
  from: string;
  to: string;
  type: string;
  content: string;
  summary?: string;
}

interface BroadcastParams {
  from: string;
  content: string;
  summary?: string;
}

interface ReadInboxOptions {
  clear?: boolean;
  limit?: number;
}

export class Mailbox {
  private readonly teamsDir: string;
  private readonly teamName: string;

  constructor(teamsDir: string, teamName: string) {
    this.teamsDir = teamsDir;
    this.teamName = teamName;
  }

  async sendDirectMessage(params: DirectMessageParams): Promise<{ messageId: string }> {
    this.validateMessageParams(params.from, params.content, params.type);

    if (!params.to || params.to.trim() === "") {
      throw new Error("Recipient cannot be empty");
    }

    const messageSize = Buffer.byteLength(params.content, "utf-8");
    if (messageSize > MAX_MESSAGE_SIZE) {
      throw new Error(`Message size exceeds 100KB limit`);
    }

    const message: TeamMessage = {
      id: randomUUID(),
      from: params.from,
      to: params.to,
      type: params.type as TeamMessage["type"],
      content: params.content,
      timestamp: Date.now(),
    };
    if (params.summary !== undefined) message.summary = params.summary;

    const inboxDir = join(this.teamsDir, this.teamName, "inbox", params.to);
    await mkdir(inboxDir, { recursive: true });

    const inboxPath = join(inboxDir, "messages.jsonl");
    const line = JSON.stringify(message) + "\n";

    const file = await import("node:fs/promises").then((fs) =>
      fs.open(inboxPath, "a")
    );
    try {
      await file.appendFile(line);
    } finally {
      await file.close();
    }

    return { messageId: message.id };
  }

  async broadcast(params: BroadcastParams): Promise<{ messageId: string; recipientCount: number }> {
    this.validateMessageParams(params.from, params.content, "broadcast");

    const messageSize = Buffer.byteLength(params.content, "utf-8");
    if (messageSize > MAX_MESSAGE_SIZE) {
      throw new Error(`Message size exceeds 100KB limit`);
    }

    const inboxBaseDir = join(this.teamsDir, this.teamName, "inbox");

    let teammates: string[] = [];
    try {
      const entries = await readdir(inboxBaseDir, { withFileTypes: true });
      teammates = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    } catch {
      return { messageId: randomUUID(), recipientCount: 0 };
    }

    if (teammates.length === 0) {
      return { messageId: randomUUID(), recipientCount: 0 };
    }

    const messageId = randomUUID();
    const timestamp = Date.now();

    const message: TeamMessage = {
      id: messageId,
      from: params.from,
      type: "broadcast",
      content: params.content,
      timestamp,
    };
    if (params.summary !== undefined) message.summary = params.summary;

    const line = JSON.stringify(message) + "\n";

    for (const teammate of teammates) {
      const inboxDir = join(inboxBaseDir, teammate);
      const inboxPath = join(inboxDir, "messages.jsonl");

      const file = await import("node:fs/promises").then((fs) =>
        fs.open(inboxPath, "a")
      );
      try {
        await file.appendFile(line);
      } finally {
        await file.close();
      }
    }

    return { messageId, recipientCount: teammates.length };
  }

  async readInbox(sessionKey: string, options?: ReadInboxOptions): Promise<TeamMessage[]> {
    const inboxPath = join(
      this.teamsDir,
      this.teamName,
      "inbox",
      sessionKey,
      "messages.jsonl"
    );

    let content: string;
    try {
      content = await readFile(inboxPath, "utf-8");
    } catch {
      return [];
    }

    if (!content.trim()) {
      return [];
    }

    const lines = content.trim().split("\n");
    const messages: TeamMessage[] = lines.map((line) => JSON.parse(line) as TeamMessage);

    messages.sort((a, b) => a.timestamp - b.timestamp);

    let result = messages;
    if (options?.limit !== undefined && options.limit > 0) {
      result = messages.slice(0, options.limit);
    }

    if (options?.clear === true) {
      await unlink(inboxPath);
    }

    return result;
  }

  private validateMessageParams(from: string, content: string, type: string): void {
    if (!from || from.trim() === "") {
      throw new Error("Sender cannot be empty");
    }

    if (!content || content.trim() === "") {
      throw new Error("Content cannot be empty");
    }

    if (!VALID_MESSAGE_TYPES.includes(type as (typeof VALID_MESSAGE_TYPES)[number])) {
      throw new Error(`Invalid message type: ${type}`);
    }
  }
}
