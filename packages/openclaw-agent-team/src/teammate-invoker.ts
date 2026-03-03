import { getAgentTeamRuntime } from "./runtime.js";
import { createAgentTeamReplyDispatcher } from "./reply-dispatcher.js";

export type InvokeTeammateParams = {
  teamName: string;
  teammateName: string;
  message: string;
  senderName: string;
  teamsDir: string;
};

/**
 * Invokes a teammate agent with a message from another agent.
 *
 * Sessions are stored in the standard openclaw session store path
 * (~/.openclaw/agents/{agentId}/sessions/sessions.json) so they
 * appear in the TUI's /session list.
 */
export async function invokeTeammate(params: InvokeTeammateParams): Promise<void> {
  const core = getAgentTeamRuntime();
  const { teamName, teammateName, message, senderName, teamsDir } = params;

  // Reload config to get latest bindings for route resolution
  const cfg = await core.config.loadConfig();

  const route = core.channel.routing.resolveAgentRoute({
    cfg,
    channel: "agent-team",
    accountId: "default",
    peer: { kind: "direct", id: `${teamName}:${teammateName}` },
  });

  // Use route values for proper agent identity in sessions
  const agentId = route.agentId ?? `teammate-${teamName}-${teammateName}`;
  const sessionKey = route.sessionKey ?? `agent:${agentId}:main`;

  // Build context payload
  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: message,
    RawBody: message,
    CommandBody: message,
    From: `agent-team:${senderName}`,
    To: `${teamName}:${teammateName}`,
    SessionKey: sessionKey,
    AccountId: route.accountId ?? "default",
    ChatType: "direct",
    SenderName: senderName,
    SenderId: senderName,
    Provider: "agent-team",
    Surface: "agent-team",
    MessageSid: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    Timestamp: Date.now(),
    WasMentioned: true,
    CommandAuthorized: true,
    OriginatingChannel: "agent-team",
    OriginatingTo: `${teamName}:${teammateName}`,
  });

  // Resolve session store path using standard openclaw path resolution
  // This ensures sessions appear in TUI's /session list
  const storePath = core.channel.session.resolveStorePath(cfg.session?.store, { agentId });

  // Record inbound session using standard session store path
  await core.channel.session.recordInboundSession({
    storePath,
    sessionKey,
    ctx: ctxPayload,
    createIfMissing: true,
    updateLastRoute: {
      sessionKey,
      channel: "agent-team",
      to: `${teamName}:${teammateName}`,
      accountId: route.accountId ?? "default",
    },
    onRecordError: (err: unknown) => {
      console.error(`[agent-team] Failed to record session for ${agentId}:`, err);
    },
  });

  // Create reply dispatcher
  const { dispatcher, replyOptions } = createAgentTeamReplyDispatcher({
    cfg,
    agentId,
    teamName,
    teammateName,
    teamsDir,
  });

  // Invoke the teammate agent with standard config (no session.store override)
  // Sessions will be stored in ~/.openclaw/agents/{agentId}/sessions/
  await core.channel.reply.dispatchReplyFromConfig({
    ctx: ctxPayload,
    cfg,
    dispatcher,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    replyOptions: replyOptions as any,
  });
}
