import type { TeamConfig, TeammateDefinition } from "./types.js";
import { parseTeammateAgentId, TEAMMATE_AGENT_ID_PREFIX, buildTeammateAgentId } from "./types.js";
import { readTeamConfig } from "./storage.js";
import { TeamLedger } from "./ledger.js";
import { join } from "node:path";

// Hook event and context types from OpenClaw plugin SDK
export interface BeforePromptBuildEvent {
  prompt: string;
  messages: unknown[];
}

export interface AgentContext {
  agentId?: string;
  sessionKey?: string;
  sessionId?: string;
  workspaceDir?: string;
  messageProvider?: string;
}

export interface HookResult {
  appendSystemContext?: string;
  systemPrompt?: string;
}

function isTeammateAgent(agentId?: string): boolean {
  return agentId?.startsWith(TEAMMATE_AGENT_ID_PREFIX) ?? false;
}

function buildTeammateContext(
  teamConfig: TeamConfig,
  teammate: TeammateDefinition,
  teamName: string,
  allMembers: TeammateDefinition[]
): string {
  const lines: string[] = [
    `<teammate-context>`,
    `You are a teammate agent in team "${teamConfig.team_name}".`,
    ``,
    `**Team Information:**`,
    `- Team: ${teamConfig.team_name}`,
    `- Team Leader: ${teamConfig.lead}`,
    `- Your Name: ${teammate.name}`,
    `- Your Role: ${teammate.agentType}`,
  ];

  if (teamConfig.description) {
    lines.push(`- Team Description: ${teamConfig.description}`);
  }

  const otherMembers = allMembers.filter(
    (m) => m.name.toLowerCase() !== teammate.name.toLowerCase() && m.status !== "shutdown"
  );

  if (otherMembers.length > 0) {
    lines.push(``, `**Team Members:**`);
    for (const member of otherMembers) {
      const agentId = buildTeammateAgentId(teamName, member.name);
      lines.push(`- ${member.name} (${member.agentType}): agentId = "${agentId}"`);
    }
  }

  const exampleTarget = `${teamName}:<teammate_name>`;
  lines.push(
    ``,
    `**Communication:**`,
    `Send messages to teammates via the agent-team channel using the target format \`"<teamName>:<teammateName>"\`.`,
    `Example target: \`"${exampleTarget}"\``,
    ``,
    `**Key Responsibilities:**`,
    `1. Report to your team leader when you start or complete work`,
    `2. Use the agent-team channel to coordinate with other teammates`,
    `3. Communicate progress updates through direct messages`,
    `</teammate-context>`
  );

  return lines.join("\n");
}

export function createTeammateContextHook(teamsDir: string, log: (msg: string) => void = console.error) {
  return async (
    _event: unknown,
    ctx: unknown
  ): Promise<HookResult> => {
    const agentCtx = ctx as AgentContext;

    if (!isTeammateAgent(agentCtx.agentId)) {
      return {};
    }

    const parsed = parseTeammateAgentId(agentCtx.agentId!);
    if (!parsed) {
      return {};
    }

    const { teamName, teammateName } = parsed;

    try {
      const teamConfig = await readTeamConfig(teamsDir, teamName);
      if (!teamConfig) {
        return {};
      }

      if (teamConfig.metadata.status !== "active") {
        return {};
      }

      const ledger = new TeamLedger(join(teamsDir, teamName));

      try {
        const members = await ledger.listMembers();
        const teammate = members.find(
          (m) => m.name.toLowerCase() === teammateName.toLowerCase()
        );

        if (!teammate) {
          return {};
        }

        const appendSystemContext = buildTeammateContext(teamConfig, teammate, teamName, members);
        return { appendSystemContext };
      } finally {
        ledger.close();
      }
    } catch (err) {
      log(`[agent-team] Context injection error: ${err}`);
      return {};
    }
  };
}
