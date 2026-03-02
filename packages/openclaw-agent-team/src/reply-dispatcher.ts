import {
  createReplyPrefixContext,
  type ClawdbotConfig,
  type ReplyPayload,
} from "openclaw/plugin-sdk";
import { getAgentTeamRuntime } from "./runtime.js";
import { Mailbox } from "./mailbox.js";

export type CreateAgentTeamReplyDispatcherParams = {
  cfg: ClawdbotConfig;
  agentId: string;
  teamName: string;
  teammateName: string;
  teamsDir: string;
};

// Use a helper to get the return type without TypeScript inference issues
type ReplyDispatcherWithTypingResult = ReturnType<
  NonNullable<ReturnType<typeof getAgentTeamRuntime>["channel"]["reply"]["createReplyDispatcherWithTyping"]>
>;

export function createAgentTeamReplyDispatcher(
  params: CreateAgentTeamReplyDispatcherParams
): ReplyDispatcherWithTypingResult {
  const core = getAgentTeamRuntime();
  const { cfg, agentId, teamName, teammateName, teamsDir } = params;
  const prefixContext = createReplyPrefixContext({ cfg, agentId });

  const humanDelay = core.channel.reply.resolveHumanDelayConfig(cfg, agentId) ?? {
    minMs: 500,
    maxMs: 2000,
  };

  return core.channel.reply.createReplyDispatcherWithTyping({
    responsePrefix: prefixContext.responsePrefix ?? "",
    responsePrefixContextProvider: prefixContext.responsePrefixContextProvider,
    humanDelay,
    onReplyStart: () => {
      // No typing indicators for internal channel
    },
    deliver: async (payload: ReplyPayload) => {
      const text = payload.text ?? "";
      if (!text.trim()) return;

      // Write teammate's response to sender's inbox
      // This enables the sender to see teammate responses
      const mailbox = new Mailbox(teamsDir, teamName);

      // Determine the recipient from the context
      // When a teammate replies, the response goes back to the team lead or original sender
      // For now, we broadcast to all teammates except the sender
      await mailbox.broadcast({
        from: teammateName,
        content: text,
        summary: `Response from ${teammateName}`,
      });
    },
    onError: async (error) => {
      console.error(`agent-team: reply failed: ${String(error)}`);
    },
    onIdle: async () => {},
    onCleanup: () => {},
  });
}
