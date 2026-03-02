import { Type, type Static } from "@sinclair/typebox";
import { Mailbox, MAX_MESSAGE_SIZE } from "../mailbox.js";
import { TeamLedger } from "../ledger.js";

// Dynamic import for internal heartbeat wake function
// This is an internal OpenClaw API that may not be stable
type RequestHeartbeatNowFn = (opts?: {
  reason?: string;
  coalesceMs?: number;
  agentId?: string;
  sessionKey?: string;
}) => void;

let _requestHeartbeatNow: RequestHeartbeatNowFn | null = null;
let _heartbeatCheckDone = false;

/**
 * Gets the requestHeartbeatNow function from OpenClaw's internal module.
 * Uses a workaround to avoid static analysis by Vitest/Vite.
 */
function getRequestHeartbeatNow(): Promise<RequestHeartbeatNowFn | null> {
  if (_requestHeartbeatNow) return Promise.resolve(_requestHeartbeatNow);
  if (_heartbeatCheckDone) return Promise.resolve(null);

  // Use dynamic path to avoid static analysis
  const basePath = "openclaw/dist/plugin-sdk/infra";
  const modulePath = `${basePath}/heartbeat-wake.js`;

  return import(modulePath)
    .then((module) => {
      _requestHeartbeatNow = module.requestHeartbeatNow as RequestHeartbeatNowFn | null;
      _heartbeatCheckDone = true;
      return _requestHeartbeatNow;
    })
    .catch(() => {
      _heartbeatCheckDone = true;
      return null;
    });
}

// Schema for send_message parameters
export const SendMessageSchema = Type.Object({
  type: Type.Union([Type.Literal("message"), Type.Literal("broadcast")]),
  recipient: Type.Optional(Type.String()),
  content: Type.String(),
  summary: Type.String({ minLength: 5, maxLength: 100 }),
});

export type SendMessageParams = Static<typeof SendMessageSchema>;

// Response types
export interface DirectMessageResponse {
  messageId: string;
  recipient: string;
  delivered: boolean;
}

export interface BroadcastResponse {
  messageId: string;
  delivered: number;
  recipients: string[];
}

export interface ToolError {
  error: {
    code: string;
    message: string;
  };
}

// Plugin context type
export interface PluginContext {
  teamsDir: string;
}

// Tool type for testing compatibility
export interface SendMessageTool {
  label: string;
  name: string;
  description: string;
  schema: typeof SendMessageSchema;
  handler: (params: SendMessageParams) => Promise<DirectMessageResponse | BroadcastResponse | ToolError>;
}

/**
 * Creates a send_message tool that allows sending direct messages or broadcasts to teammates.
 */
export function createSendMessageTool(
  ctx: PluginContext,
  teamName: string,
  senderName: string,
  ledger: TeamLedger
): SendMessageTool {
  const mailbox = new Mailbox(ctx.teamsDir, teamName);

  return {
    label: "Send Message",
    name: "send_message",
    description: "Send a direct message to a teammate or broadcast to all teammates",
    schema: SendMessageSchema,
    handler: async (
      params: SendMessageParams
    ): Promise<DirectMessageResponse | BroadcastResponse | ToolError> => {
      const { type, recipient, content, summary } = params;

      // Validate content size
      const contentSize = Buffer.byteLength(content, "utf-8");
      if (contentSize > MAX_MESSAGE_SIZE) {
        return {
          error: {
            code: "MESSAGE_TOO_LARGE",
            message: `Message size (${contentSize} bytes) exceeds maximum allowed size (${MAX_MESSAGE_SIZE} bytes)`,
          },
        };
      }

      if (type === "message") {
        // Direct message
        // Check recipient first before other validations
        if (!recipient || recipient.trim() === "") {
          return {
            error: {
              code: "RECIPIENT_NOT_FOUND",
              message: "Recipient is required for direct messages",
            },
          };
        }

        // Check if recipient exists in the team
        const members = await ledger.listMembers();
        const recipientMember = members.find((m) => m.name === recipient);

        if (!recipientMember) {
          return {
            error: {
              code: "RECIPIENT_NOT_FOUND",
              message: `Recipient "${recipient}" not found in team`,
            },
          };
        }

        // Validate summary is provided (after recipient check)
        if (!summary || summary.trim().length < 5) {
          return {
            error: {
              code: "MISSING_SUMMARY",
              message: "Summary is required and must be between 5 and 100 characters",
            },
          };
        }

        // Send direct message
        const result = await mailbox.sendDirectMessage({
          from: senderName,
          to: recipient,
          type: "message",
          content,
          summary,
        });

        // Wake the teammate via heartbeat (internal API, may not be available)
        const agentId = `teammate-${teamName}-${recipient}`;
        const sessionKey = `agent:${agentId}:main`;
        const requestHeartbeatNow = await getRequestHeartbeatNow();
        if (requestHeartbeatNow) {
          requestHeartbeatNow({
            reason: "teammate-message",
            sessionKey,
            coalesceMs: 250, // Batch multiple messages within 250ms
          });
        }

        return {
          messageId: result.messageId,
          recipient,
          delivered: true,
        };
      } else {
        // Broadcast
        // Validate summary is provided
        if (!summary || summary.trim().length < 5) {
          return {
            error: {
              code: "MISSING_SUMMARY",
              message: "Summary is required and must be between 5 and 100 characters",
            },
          };
        }

        const members = await ledger.listMembers();

        // Filter out the sender from broadcast recipients
        const recipients = members.filter((m) => m.name !== senderName);

        if (recipients.length === 0) {
          return {
            messageId: "",
            delivered: 0,
            recipients: [],
          };
        }

        // Send broadcast
        const result = await mailbox.broadcast({
          from: senderName,
          content,
          summary,
        });

        // Wake all teammates via heartbeat (internal API, may not be available)
        const requestHeartbeatNow = await getRequestHeartbeatNow();
        if (requestHeartbeatNow) {
          for (const r of recipients) {
            const agentId = `teammate-${teamName}-${r.name}`;
            const sessionKey = `agent:${agentId}:main`;
            requestHeartbeatNow({
              reason: "teammate-broadcast",
              sessionKey,
              coalesceMs: 250, // Batch multiple messages within 250ms
            });
          }
        }

        return {
          messageId: result.messageId,
          delivered: recipients.length,
          recipients: recipients.map((r) => r.name),
        };
      }
    },
  };
}
