import { describe, it, expect } from "vitest";
import type {
  TeamConfig,
  TeammateDefinition,
  AgentTeamConfig,
} from "../src/types.js";
import {
  validateTeamConfig,
  validateTeammateDefinition,
  validateAgentTeamConfig,
} from "../src/types.js";

describe("Type Definitions", () => {
  describe("TeamConfig", () => {
    it("should have required fields", () => {
      const config: TeamConfig = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        team_name: "test-team",
        description: "A test team",
        agent_type: "team-lead",
        lead: "lead-agent",
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          status: "active",
        },
      };

      expect(config.id).toBeDefined();
      expect(config.team_name).toBeDefined();
      expect(config.agent_type).toBeDefined();
      expect(config.lead).toBeDefined();
      expect(config.metadata).toBeDefined();
      expect(config.metadata.status).toBeOneOf(["active", "shutdown"]);
    });

    it("should validate with TypeBox schema", () => {
      const validConfig = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        team_name: "test-team",
        description: "A test team",
        agent_type: "team-lead",
        lead: "lead-agent",
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          status: "active",
        },
      };

      expect(validateTeamConfig(validConfig)).toBe(true);
    });

    it("should reject invalid team config", () => {
      const invalidConfig = {
        id: 123, // should be string
        team_name: "test-team",
      };

      expect(validateTeamConfig(invalidConfig)).toBe(false);
    });
  });

  describe("TeammateDefinition", () => {
    it("should have required fields", () => {
      const teammate: TeammateDefinition = {
        name: "researcher",
        agentId: "teammate-test-researcher",
        sessionKey: "agent:teammate-test-researcher:main",
        agentType: "Explore",
        model: "claude-sonnet-4",
        tools: { allow: ["read", "grep"] },
        status: "idle",
        joinedAt: Date.now(),
      };

      expect(teammate.name).toBeDefined();
      expect(teammate.agentId).toBeDefined();
      expect(teammate.sessionKey).toBeDefined();
      expect(teammate.agentType).toBeDefined();
      expect(teammate.status).toBeOneOf([
        "idle",
        "working",
        "error",
        "shutdown",
      ]);
    });

    it("should validate with TypeBox schema", () => {
      const validTeammate = {
        name: "researcher",
        agentId: "teammate-test-researcher",
        sessionKey: "agent:teammate-test-researcher:main",
        agentType: "Explore",
        status: "idle",
        joinedAt: Date.now(),
      };

      expect(validateTeammateDefinition(validTeammate)).toBe(true);
    });

    it("should reject invalid status", () => {
      const invalidTeammate = {
        name: "researcher",
        agentId: "teammate-test-researcher",
        sessionKey: "agent:teammate-test-researcher:main",
        agentType: "Explore",
        status: "invalid-status",
        joinedAt: Date.now(),
      };

      expect(validateTeammateDefinition(invalidTeammate)).toBe(false);
    });
  });

  describe("AgentTeamConfig", () => {
    it("should have plugin configuration fields", () => {
      const config: AgentTeamConfig = {
        maxTeammatesPerTeam: 10,
        defaultAgentType: "general-purpose",
        teamsDir: "~/.openclaw/teams",
      };

      expect(config.maxTeammatesPerTeam).toBeDefined();
      expect(config.defaultAgentType).toBeDefined();
    });

    it("should validate with TypeBox schema", () => {
      const validConfig = {
        maxTeammatesPerTeam: 10,
        defaultAgentType: "general-purpose",
      };

      expect(validateAgentTeamConfig(validConfig)).toBe(true);
    });
  });
});
