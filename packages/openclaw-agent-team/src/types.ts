import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

// Agent ID constants and helpers
export const TEAMMATE_AGENT_ID_PREFIX = "teammate-";
export const AGENT_TEAM_CHANNEL = "agent-team";

/**
 * Builds a teammate agent ID from team name and teammate name.
 * Format: teammate-{teamName}-{teammateName} (all lowercase for consistency)
 * Note: teammate names must not contain hyphens, since the last hyphen is used
 * as the delimiter when parsing. Team names may contain hyphens.
 */
export function buildTeammateAgentId(teamName: string, teammateName: string): string {
  return `${TEAMMATE_AGENT_ID_PREFIX}${teamName.toLowerCase()}-${teammateName.toLowerCase()}`;
}

/**
 * Parses a teammate agent ID to extract team name and teammate name.
 * Returns null if the ID is not a valid teammate agent ID.
 */
export function parseTeammateAgentId(agentId: string): { teamName: string; teammateName: string } | null {
  if (!agentId.startsWith(TEAMMATE_AGENT_ID_PREFIX)) {
    return null;
  }

  const suffix = agentId.slice(TEAMMATE_AGENT_ID_PREFIX.length);
  // Split on LAST hyphen to handle team names with hyphens (e.g., "chat-team")
  const lastHyphenIndex = suffix.lastIndexOf("-");

  if (lastHyphenIndex === -1) {
    return null;
  }

  const teamName = suffix.slice(0, lastHyphenIndex);
  const teammateName = suffix.slice(lastHyphenIndex + 1);

  if (!teamName || !teammateName) {
    return null;
  }

  return { teamName, teammateName };
}

// Team Configuration

export const TeamConfigSchema = Type.Object({
  id: Type.String(),
  team_name: Type.String({ minLength: 1, maxLength: 50 }),
  description: Type.Optional(Type.String()),
  agent_type: Type.String({ default: "team-lead" }),
  lead: Type.String(),
  metadata: Type.Object({
    createdAt: Type.Number(),
    updatedAt: Type.Number(),
    status: Type.Union([Type.Literal("active"), Type.Literal("shutdown")]),
  }),
});

export type TeamConfig = Static<typeof TeamConfigSchema>;

// Teammate Definition

export const TeammateStatusSchema = Type.Union([
  Type.Literal("idle"),
  Type.Literal("working"),
  Type.Literal("error"),
  Type.Literal("shutdown"),
]);

export const TeammateToolsSchema = Type.Object({
  allow: Type.Optional(Type.Array(Type.String())),
  deny: Type.Optional(Type.Array(Type.String())),
});

export const TeammateDefinitionSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 100 }),
  agentId: Type.String(),
  sessionKey: Type.String(),
  agentType: Type.String(),
  model: Type.Optional(Type.String()),
  tools: Type.Optional(TeammateToolsSchema),
  status: TeammateStatusSchema,
  joinedAt: Type.Number(),
});

export type TeammateDefinition = Static<typeof TeammateDefinitionSchema>;

// Plugin Configuration

export const TeammatePathTemplatesSchema = Type.Object({
  workspaceTemplate: Type.Optional(Type.String()),
  agentDirTemplate: Type.Optional(Type.String()),
});

export type TeammatePathTemplates = Static<typeof TeammatePathTemplatesSchema>;

export const AgentTeamConfigSchema = Type.Object({
  maxTeammatesPerTeam: Type.Number({ default: 10, minimum: 1, maximum: 50 }),
  defaultAgentType: Type.String({ default: "general-purpose" }),
  teamsDir: Type.Optional(Type.String()),
  pathTemplates: Type.Optional(TeammatePathTemplatesSchema),
});

export type AgentTeamConfig = Static<typeof AgentTeamConfigSchema>;

// Default path templates for teammate workspace/agent directories
export const DEFAULT_WORKSPACE_TEMPLATE = "{teamsDir}/{teamName}/agents/{teammateName}/workspace";
export const DEFAULT_AGENT_DIR_TEMPLATE = "{teamsDir}/{teamName}/agents/{teammateName}/agent";

// Validation helper functions

export function validateTeamConfig(value: unknown): boolean {
  return Value.Check(TeamConfigSchema, value);
}

export function validateTeammateDefinition(value: unknown): boolean {
  return Value.Check(TeammateDefinitionSchema, value);
}

export function validateAgentTeamConfig(value: unknown): boolean {
  return Value.Check(AgentTeamConfigSchema, value);
}
