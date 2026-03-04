import type { ChannelPlugin, ChannelOutboundContext } from "openclaw/plugin-sdk";
import { mkdir, appendFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";

interface OutboundDeliveryResult {
  channel: string;
  messageId: string;
  timestamp: number;
}

// Minimal shape of the global config needed to extract this plugin's teamsDir.
interface AgentTeamCfg {
  plugins?: {
    entries?: {
      "openclaw-agent-team"?: {
        config?: { teamsDir?: string };
      };
    };
  };
}

function resolveTeamsDir(cfg: unknown): string {
  return (
    (cfg as AgentTeamCfg)?.plugins?.entries?.["openclaw-agent-team"]?.config?.teamsDir ??
    join(homedir(), ".openclaw", "teams")
  );
}

// Lowercase alphanumeric and hyphens only — matches TEAM_NAME_PATTERN / TEAMMATE_NAME_PATTERN
const SAFE_NAME_RE = /^[a-z0-9-]+$/;

/**
 * Validates and normalizes a "teamName:teammateName" target.
 * Returns [teamName, teammateName] (both lowercased) or null if invalid.
 * Both parts must consist of lowercase alphanumeric characters and hyphens only,
 * preventing path traversal via ".." or "/" in the inbox directory path.
 */
function parseTarget(target: string): [string, string] | null {
  if (!target) return null;
  const parts = target.split(":");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const teamName = parts[0].toLowerCase();
  const teammateName = parts[1].toLowerCase();
  if (!SAFE_NAME_RE.test(teamName) || !SAFE_NAME_RE.test(teammateName)) return null;
  return [teamName, teammateName];
}

async function writeInboxMessage(
  to: string,
  payload: Record<string, unknown>,
  cfg: unknown
): Promise<OutboundDeliveryResult> {
  const parsed = parseTarget(to);
  if (!parsed) {
    throw new Error(`Invalid target format: ${to}. Expected "teamName:teammateName"`);
  }
  const [teamName, teammateName] = parsed;
  const teamsDir = resolveTeamsDir(cfg);

  // Path traversal protection: ensure inbox path stays within teamsDir
  const normalizedTeamsDir = resolve(teamsDir);
  const inboxDir = resolve(normalizedTeamsDir, teamName, "inbox", teammateName);
  if (!inboxDir.startsWith(normalizedTeamsDir + sep)) {
    throw new Error(`Path traversal detected for target: ${to}`);
  }
  const inboxPath = join(inboxDir, "messages.jsonl");

  await mkdir(inboxDir, { recursive: true });

  const timestamp = Date.now();
  const message = {
    id: `msg-${randomUUID()}`,
    to,
    timestamp,
    ...payload,
  };

  await appendFile(inboxPath, JSON.stringify(message) + "\n", "utf-8");

  return { channel: "agent-team", messageId: message.id, timestamp };
}

const meta = {
  id: "agent-team",
  label: "Agent Team",
  selectionLabel: "Agent Team (Internal)",
  docsPath: "/channels/agent-team",
  docsLabel: "agent-team",
  blurb: "Internal channel for multi-agent team coordination.",
  order: 100,
};

// Track running state to prevent health monitor from thinking the agent stopped
let isAgentRunning = false;

export const agentTeamChannelPlugin: ChannelPlugin = {
  id: "agent-team",
  meta: {
    ...meta,
  },
  capabilities: {
    chatTypes: ["direct"],
    polls: false,
    threads: false,
    media: false,
    reactions: false,
    edit: false,
    reply: true,
  },
  agentPrompt: {
    messageToolHints: () => [
      "- Agent Team targeting: use team_name:teammate_name format for direct messages.",
      "- This is an internal channel for coordinating multi-agent teams.",
    ],
  },
  messaging: {
    normalizeTarget: (target) => {
      const parsed = parseTarget(target);
      if (!parsed) {
        throw new Error(
          `Invalid target format: ${target}. Expected "teamName:teammateName"`
        );
      }
      return `${parsed[0]}:${parsed[1]}`;
    },
    targetResolver: {
      looksLikeId: (id) => id.includes(":"),
      hint: "<teamName:teammateName>",
    },
  },
  directory: {
    self: async () => null,
    listPeers: async () => [],
    listGroups: async () => [],
    listPeersLive: async () => [],
    listGroupsLive: async () => [],
  },
  status: {
    defaultRuntime: {
      accountId: "default",
      running: isAgentRunning,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
      port: null,
    },
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? true,
      running: snapshot.running ?? isAgentRunning,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
      port: snapshot.port ?? null,
    }),
    probeAccount: async () => ({ ok: true }),
    buildAccountSnapshot: ({ account }) => ({
      accountId: account.accountId ?? "default",
      enabled: account.enabled ?? true,
      configured: account.configured ?? true,
      name: account.name ?? "Agent Team",
      running: isAgentRunning,
      lastStartAt: isAgentRunning ? Date.now() : null,
      lastStopAt: !isAgentRunning ? Date.now() : null,
      lastError: null,
      port: null,
      probe: { ok: true },
    }),
  },
  gateway: {
    startAccount: async () => {
      // No external listener needed - invocation happens via invokeTeammate()
      // Set running state to prevent health monitor from thinking agent stopped
      isAgentRunning = true;
      // Return stop function that properly signals the agent has stopped
      return {
        stop: () => {
          isAgentRunning = false;
        },
      };
    },
  },
  config: {
    listAccountIds: () => ["default"],
    resolveAccount: () => ({
      accountId: "default",
      enabled: true,
      configured: true,
      name: "Agent Team",
    }),
    defaultAccountId: () => "default",
    setAccountEnabled: ({ cfg }) => cfg,
    deleteAccount: ({ cfg }) => cfg,
    isConfigured: () => true,
    describeAccount: () => ({
      accountId: "default",
      enabled: true,
      configured: true,
      name: "Agent Team",
    }),
    resolveAllowFrom: () => [],
    formatAllowFrom: () => [],
  },
  outbound: {
    deliveryMode: "direct" as const,

    resolveTarget: ({ to }) => {
      const parsed = parseTarget(to);
      if (!parsed) {
        return {
          ok: false,
          error: new Error(
            `Invalid target format: ${to}. Expected "teamName:teammateName"`
          ),
        };
      }
      return { ok: true, to: `${parsed[0]}:${parsed[1]}` };
    },

    sendText: async ({ to, text, cfg }: ChannelOutboundContext): Promise<OutboundDeliveryResult> => {
      return writeInboxMessage(to, { type: "message", content: text }, cfg);
    },

    sendMedia: async ({ to, text, mediaUrl, cfg }: ChannelOutboundContext): Promise<OutboundDeliveryResult> => {
      if (!mediaUrl) {
        throw new Error("mediaUrl is required for media messages");
      }
      return writeInboxMessage(to, { type: "media", content: text, mediaUrl }, cfg);
    },
  },
  reload: { configPrefixes: ["plugins.agent-team"] },
  configSchema: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
  setup: {
    resolveAccountId: () => "default",
    applyAccountConfig: ({ cfg }) => cfg,
  },
};
