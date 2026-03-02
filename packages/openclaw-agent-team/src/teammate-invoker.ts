import type { ClawdbotConfig } from "openclaw/plugin-sdk";
import { mkdir } from "node:fs/promises";
import { getAgentTeamRuntime } from "./runtime.js";
import { createAgentTeamReplyDispatcher } from "./reply-dispatcher.js";
import {
  resolveTeammateSessionStorePath,
  resolveTeammateSessionsDir,
} from "./storage.js";

export type InvokeTeammateParams = {
  cfg: ClawdbotConfig;
  teamName: string;
  teammateName: string;
  message: string;
  senderName: string;
  teamsDir: string;
};

/**
 * Invokes a teammate agent with a message from another agent.
 * This wakes up the teammate and allows it to process the message autonomously.
 */
export async function invokeTeammate(params: InvokeTeammateParams): Promise<void> {
  const core = getAgentTeamRuntime();
  const { cfg, teamName, teammateName, message, senderName, teamsDir } = params;

  const agentId = `teammate-${teamName}-${teammateName}`;
  const sessionKey = `agent:${agentId}:main`;

  // Resolve route for teammate
  const route = core.channel.routing.resolveAgentRoute({
    cfg,
    channel: "agent-team",
    accountId: "default",
    peer: { kind: "direct", id: `${teamName}:${teammateName}` },
  });

  // Build context payload
  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: message,
    RawBody: message,
    CommandBody: message,
    From: `agent-team:${senderName}`,
    To: `${teamName}:${teammateName}`,
    SessionKey: route.sessionKey ?? sessionKey,
    AccountId: "default",
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

  // Resolve session paths in teamsDir
  const storePath = resolveTeammateSessionStorePath(teamsDir, teamName, teammateName);
  const sessionsDir = resolveTeammateSessionsDir(teamsDir, teamName, teammateName);

  // Ensure sessions directory exists
  await mkdir(sessionsDir, { recursive: true, mode: 0o700 });

  // Record inbound session with custom storePath
  const persistedSessionKey = ctxPayload.SessionKey ?? sessionKey;
  await core.channel.session.recordInboundSession({
    storePath,
    sessionKey: persistedSessionKey,
    ctx: ctxPayload,
    createIfMissing: true,
    updateLastRoute: {
      sessionKey: persistedSessionKey,
      channel: "agent-team",
      to: `${teamName}:${teammateName}`,
      accountId: "default",
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

  // Override cfg.session.store to use teamsDir path
  const modifiedCfg = {
    ...cfg,
    session: {
      ...cfg.session,
      store: storePath,
    },
  };

  // Invoke the teammate agent with modified config
  await core.channel.reply.dispatchReplyFromConfig({
    ctx: ctxPayload,
    cfg: modifiedCfg,
    dispatcher,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    replyOptions: replyOptions as any,
  });
}
