import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { TeamLedger } from "../src/ledger.js";
import type { TeammateDefinition } from "../src/types.js";

describe("TeamLedger", () => {
  let tempDir: string;
  let dbPath: string;
  let ledger: TeamLedger;

  beforeEach(async () => {
    tempDir = join(process.cwd(), "test-temp", `ledger-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
    dbPath = join(tempDir, "ledger.db");
    ledger = new TeamLedger(dbPath);
  });

  afterEach(async () => {
    ledger.close();
    await rm(join(process.cwd(), "test-temp"), { recursive: true, force: true });
  });

  describe("Member Operations", () => {
    const createTestMember = (name: string, sessionKey: string): TeammateDefinition => ({
      name,
      agentId: `agent-${name}`,
      sessionKey,
      agentType: "Explore",
      status: "idle",
      joinedAt: Date.now(),
    });

    it("should add member to the team", async () => {
      const member = createTestMember("researcher", "session-researcher-1");
      await ledger.addMember(member);

      const members = await ledger.listMembers();
      expect(members.length).toBe(1);
      expect(members[0].name).toBe("researcher");
      expect(members[0].sessionKey).toBe("session-researcher-1");
    });

    it("should list all members", async () => {
      await ledger.addMember(createTestMember("researcher", "session-1"));
      await ledger.addMember(createTestMember("coder", "session-2"));
      await ledger.addMember(createTestMember("reviewer", "session-3"));

      const members = await ledger.listMembers();
      expect(members.length).toBe(3);
      expect(members.map((m: TeammateDefinition) => m.name).sort()).toEqual(["coder", "researcher", "reviewer"]);
    });

    it("should update member status", async () => {
      const member = createTestMember("researcher", "session-1");
      await ledger.addMember(member);

      const success = await ledger.updateMemberStatus("session-1", "working");
      expect(success).toBe(true);

      const members = await ledger.listMembers();
      expect(members[0].status).toBe("working");
    });

    it("should return false when updating non-existent member", async () => {
      const success = await ledger.updateMemberStatus("non-existent-session", "working");
      expect(success).toBe(false);
    });

    it("should remove member by session key", async () => {
      await ledger.addMember(createTestMember("researcher", "session-1"));
      await ledger.addMember(createTestMember("coder", "session-2"));

      const success = await ledger.removeMember("session-1");
      expect(success).toBe(true);

      const members = await ledger.listMembers();
      expect(members.length).toBe(1);
      expect(members[0].name).toBe("coder");
    });

    it("should return false when removing non-existent member", async () => {
      const success = await ledger.removeMember("non-existent-session");
      expect(success).toBe(false);
    });
  });

  describe("Data Persistence", () => {
    it("should persist data across ledger instances", async () => {
      const persistDbPath = join(tempDir, "persist-test.db");

      // Create and populate database
      const ledger1 = new TeamLedger(persistDbPath);
      await ledger1.addMember({
        name: "persistent-member",
        agentId: "agent-1",
        sessionKey: "session-1",
        agentType: "Explore",
        status: "idle",
        joinedAt: Date.now(),
      });
      ledger1.close();

      // Reopen and verify data
      const ledger2 = new TeamLedger(persistDbPath);
      const members = await ledger2.listMembers();

      expect(members.length).toBe(1);
      expect(members[0].name).toBe("persistent-member");

      ledger2.close();
    });
  });
});
