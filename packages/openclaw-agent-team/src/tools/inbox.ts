import { Type, type Static } from "@sinclair/typebox";
import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import type { TeamMessage } from "../types.js";

// Schema for inbox parameters
export const InboxSchema = Type.Object({
  clear: Type.Optional(Type.Boolean()),
  limit: Type.Optional(Type.Number({ minimum: 1 })),
});

export type InboxParams = Static<typeof InboxSchema>;

// Response types
export interface InboxResponse {
  messages: TeamMessage[];
}

export interface ToolError {
  error: {
    code: string;
    message: string;
  };
}

// Session context type
export interface SessionContext {
  teamsDir: string;
  teamName: string;
  teammateName: string;
}

// Tool type for testing compatibility
export interface InboxTool {
  label: string;
  name: string;
  description: string;
  schema: typeof InboxSchema;
  handler: (params: InboxParams) => Promise<InboxResponse | ToolError>;
}

/**
 * Creates an inbox tool that allows reading messages from a teammate's inbox.
 */
export function createInboxTool(ctx: SessionContext): InboxTool {
  return {
    label: "Inbox",
    name: "inbox",
    description: "Read messages from your inbox, optionally clearing them after reading",
    schema: InboxSchema,
    handler: async (params: InboxParams): Promise<InboxResponse | ToolError> => {
      const { clear, limit } = params;

      // Check if this is a valid teammate session
      if (!ctx.teammateName || ctx.teammateName.trim() === "") {
        return {
          error: {
            code: "NOT_TEAMMATE",
            message: "Current session is not a teammate session",
          },
        };
      }

      const inboxPath = join(
        ctx.teamsDir,
        ctx.teamName,
        "inbox",
        ctx.teammateName,
        "messages.jsonl"
      );

      // Read the inbox file
      let content: string;
      try {
        content = await readFile(inboxPath, "utf-8");
      } catch {
        return {
          messages: [],
        };
      }

      if (!content.trim()) {
        return {
          messages: [],
        };
      }

      // Parse messages
      const lines = content.trim().split("\n");
      const messages: TeamMessage[] = lines.map((line) => JSON.parse(line) as TeamMessage);

      // Sort by timestamp ascending (chronological order)
      messages.sort((a, b) => a.timestamp - b.timestamp);

      // Apply limit - get the N most recent messages
      let result = messages;
      if (limit !== undefined && limit > 0 && limit < messages.length) {
        // Get the last N messages (most recent)
        result = messages.slice(-limit);
      }

      // Clear inbox if requested - write empty file instead of deleting
      if (clear === true) {
        await writeFile(inboxPath, "", { mode: 0o600 });
      }

      return {
        messages: result,
      };
    },
  };
}
