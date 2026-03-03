import { mkdir } from "node:fs/promises";
import type { PluginRuntime, OpenClawConfig } from "openclaw/plugin-sdk";
import type { TeammateDefinition, TeammatePathTemplates, TeammateToolsSchema } from "./types.js";
import { TeamLedger } from "./ledger.js";
import { buildTeammateAgentId, AGENT_TEAM_CHANNEL, DEFAULT_WORKSPACE_TEMPLATE, DEFAULT_AGENT_DIR_TEMPLATE } from "./types.js";
import { resolveTemplatePath, TEAMMATE_NAME_PATTERN, readTeamConfig } from "./storage.js";
import type { Static } from "@sinclair/typebox";

export type MaybeSpawnTeammateResult = {
  created: boolean;
  agentId?: string;
  sessionKey?: string;
  teammate?: TeammateDefinition;
  error?: { code: string; message: string };
};

/**
 * Check if a teammate should be created and spawn it if needed.
 * This follows the feishu dynamic-agent pattern for consistency across plugins.
 */
export async function maybeSpawnTeammate(params: {
  teamsDir: string;
  teamName: string;
  teammateName: string;
  agentType?: string;
  model?: string;
  tools?: { allow?: string[]; deny?: string[] };
  pathTemplates?: TeammatePathTemplates;
  maxTeammates: number;
  runtime: PluginRuntime;
  ledger: TeamLedger;
  log: (msg: string) => void;
}): Promise<MaybeSpawnTeammateResult> {
  const {
    teamsDir,
    teamName,
    teammateName,
    agentType,
    model,
    tools,
    pathTemplates,
    maxTeammates,
    runtime,
    ledger,
    log,
  } = params;

  // Validate teammate name format
  if (!TEAMMATE_NAME_PATTERN.test(teammateName)) {
    return {
      created: false,
      error: {
        code: "INVALID_TEAMMATE_NAME",
        message: `Teammate name "${teammateName}" contains invalid characters. Only letters, numbers, underscores, and hyphens are allowed.`,
      },
    };
  }

  // Check team status
  const teamConfig = await readTeamConfig(teamsDir, teamName);
  if (!teamConfig) {
    return {
      created: false,
      error: {
        code: "TEAM_NOT_FOUND",
        message: `Team "${teamName}" configuration not found`,
      },
    };
  }

  if (teamConfig.metadata.status !== "active") {
    return {
      created: false,
      error: {
        code: "TEAM_NOT_ACTIVE",
        message: `Team "${teamName}" is not active. Current status: ${teamConfig.metadata.status}`,
      },
    };
  }

  // Generate agent ID
  const agentId = buildTeammateAgentId(teamName, teammateName);

  // Check current member count
  const currentMembers = await ledger.listMembers();
  if (currentMembers.length >= maxTeammates) {
    return {
      created: false,
      error: {
        code: "TEAM_AT_CAPACITY",
        message: `Team "${teamName}" has reached maximum teammates (${maxTeammates})`,
      },
    };
  }

  // Check for duplicate name in ledger
  const duplicateName = currentMembers.find((m) => m.name === teammateName);
  if (duplicateName) {
    return {
      created: false,
      error: {
        code: "DUPLICATE_TEAMMATE_NAME",
        message: `Teammate "${teammateName}" already exists in team "${teamName}"`,
      },
    };
  }

  // Load runtime config
  const cfg = await runtime.config.loadConfig();

  // Check if agent already exists in runtime config (handles race condition)
  const existingAgentIds = new Set((cfg.agents?.list ?? []).map((a) => a.id));
  if (existingAgentIds.has(agentId)) {
    return {
      created: false,
      error: {
        code: "DUPLICATE_TEAMMATE_NAME",
        message: `Teammate "${teammateName}" already exists in team "${teamName}"`,
      },
    };
  }

  // Check if binding already exists
  const existingBindings = cfg.bindings ?? [];
  const hasBinding = existingBindings.some(
    (b) =>
      b.match?.channel === AGENT_TEAM_CHANNEL &&
      b.match?.peer?.kind === "direct" &&
      b.match?.peer?.id === `${teamName.toLowerCase()}:${teammateName.toLowerCase()}`
  );

  // Resolve path templates
  const workspaceTemplate = pathTemplates?.workspaceTemplate ?? DEFAULT_WORKSPACE_TEMPLATE;
  const agentDirTemplate = pathTemplates?.agentDirTemplate ?? DEFAULT_AGENT_DIR_TEMPLATE;

  const workspace = resolveTemplatePath(workspaceTemplate, {
    teamsDir,
    teamName,
    teammateName,
    agentId,
  });

  const agentDir = resolveTemplatePath(agentDirTemplate, {
    teamsDir,
    teamName,
    teammateName,
    agentId,
  });

  log(`agent-team: creating teammate "${agentId}" for team "${teamName}"`);
  log(`  workspace: ${workspace}`);
  log(`  agentDir: ${agentDir}`);

  // Create directories
  await mkdir(workspace, { recursive: true, mode: 0o700 });
  await mkdir(agentDir, { recursive: true, mode: 0o700 });

  // Generate session key
  const sessionKey = `agent:${agentId}:main`;

  // Create teammate definition
  const now = Date.now();
  const teammate: TeammateDefinition = {
    name: teammateName,
    agentId,
    sessionKey,
    agentType: agentType ?? "general-purpose",
    status: "idle",
    joinedAt: now,
  };

  // Add optional fields
  if (model !== undefined) {
    teammate.model = model;
  }
  if (tools !== undefined) {
    teammate.tools = tools as Static<typeof TeammateToolsSchema>;
  }

  // Add teammate to ledger
  await ledger.addMember(teammate);

  // Update runtime config with new agent and binding
  const updatedCfg: OpenClawConfig = {
    ...cfg,
    agents: {
      ...cfg.agents,
      list: [...(cfg.agents?.list ?? []), { id: agentId, workspace, agentDir }],
    },
    bindings: hasBinding
      ? existingBindings
      : [
          ...existingBindings,
          {
            agentId,
            match: {
              channel: AGENT_TEAM_CHANNEL,
              peer: { kind: "direct" as const, id: `${teamName.toLowerCase()}:${teammateName.toLowerCase()}` },
            },
          },
        ],
  };

  await runtime.config.writeConfigFile(updatedCfg);

  return {
    created: true,
    agentId,
    sessionKey,
    teammate,
  };
}

/**
 * Check if an existing agent has missing binding and add it if needed.
 * This handles partial state where agent exists but binding was lost.
 */
export async function repairTeammateBinding(params: {
  teamName: string;
  teammateName: string;
  agentId: string;
  runtime: PluginRuntime;
  log: (msg: string) => void;
}): Promise<{ repaired: boolean; agentId: string }> {
  const { teamName, teammateName, agentId, runtime, log } = params;

  const cfg = await runtime.config.loadConfig();

  // Check if agent exists in config
  const existingAgent = (cfg.agents?.list ?? []).find((a) => a.id === agentId);
  if (!existingAgent) {
    return { repaired: false, agentId };
  }

  // Check if binding exists
  const existingBindings = cfg.bindings ?? [];
  const hasBinding = existingBindings.some(
    (b) =>
      b.match?.channel === AGENT_TEAM_CHANNEL &&
      b.match?.peer?.kind === "direct" &&
      b.match?.peer?.id === `${teamName.toLowerCase()}:${teammateName.toLowerCase()}`
  );

  if (hasBinding) {
    return { repaired: false, agentId };
  }

  // Add missing binding
  log(`agent-team: repairing missing binding for "${agentId}"`);

  const updatedCfg: OpenClawConfig = {
    ...cfg,
    bindings: [
      ...existingBindings,
      {
        agentId,
        match: {
          channel: AGENT_TEAM_CHANNEL,
          peer: { kind: "direct" as const, id: `${teamName.toLowerCase()}:${teammateName.toLowerCase()}` },
        },
      },
    ],
  };

  await runtime.config.writeConfigFile(updatedCfg);

  return { repaired: true, agentId };
}