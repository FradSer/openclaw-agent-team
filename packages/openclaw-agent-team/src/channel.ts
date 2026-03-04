import type { ChannelPlugin } from "openclaw/plugin-sdk";

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
    normalizeTarget: (target) => target,
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
