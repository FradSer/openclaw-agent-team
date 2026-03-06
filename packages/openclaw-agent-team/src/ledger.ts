import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { dirname } from "node:path";
import type { TeammateDefinition } from "./types.js";

interface MemberRecord {
  sessionKey: string;
  name: string;
  agentId: string;
  agentType: string;
  model?: string;
  tools?: { allow?: string[]; deny?: string[] };
  status: TeammateDefinition["status"];
  joinedAt: number;
}

/**
 * Helper to read JSONL file and parse all records
 */
async function readJsonlFile<T>(filePath: string): Promise<T[]> {
  try {
    const content = await readFile(filePath, "utf-8");
    if (!content.trim()) {
      return [];
    }
    const lines = content.trim().split("\n");
    return lines.map((line) => JSON.parse(line) as T);
  } catch {
    return [];
  }
}

/**
 * Helper to write all records to a JSONL file
 */
async function writeJsonlFile<T>(filePath: string, records: T[]): Promise<void> {
  // Ensure directory exists
  const dir = dirname(filePath);
  try {
    await stat(dir);
  } catch {
    await mkdir(dir, { recursive: true });
  }

  const lines = records.map((record) => JSON.stringify(record));
  await writeFile(filePath, lines.join("\n") + (lines.length > 0 ? "\n" : ""), {
    mode: 0o600,
  });
}

export class TeamLedger {
  private membersPath: string;

  // In-memory caches
  private membersCache: Map<string, MemberRecord> = new Map();
  private loaded = false;

  constructor(dbPath: string) {
    // dbPath is expected to be like ".../team-name/ledger.db"
    // We'll store JSONL files in the same directory
    const dir = dirname(dbPath);
    this.membersPath = `${dir}/members.jsonl`;
  }

  /**
   * Load all data from files into memory caches
   */
  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;

    // Load members
    const members = await readJsonlFile<MemberRecord>(this.membersPath);
    this.membersCache.clear();
    for (const member of members) {
      this.membersCache.set(member.sessionKey, member);
    }

    this.loaded = true;
  }

  /**
   * Persist members cache to file
   */
  private async persistMembers(): Promise<void> {
    const members = Array.from(this.membersCache.values());
    await writeJsonlFile(this.membersPath, members);
  }

  close(): void {
    // Clear caches
    this.membersCache.clear();
    this.loaded = false;
  }

  private mapRecordToMember(record: MemberRecord): TeammateDefinition {
    const member: TeammateDefinition = {
      sessionKey: record.sessionKey,
      name: record.name,
      agentId: record.agentId,
      agentType: record.agentType,
      status: record.status,
      joinedAt: record.joinedAt,
    };
    if (record.model !== undefined) member.model = record.model;
    if (record.tools !== undefined) member.tools = record.tools;
    return member;
  }

  async addMember(member: TeammateDefinition): Promise<void> {
    await this.ensureLoaded();

    const record: MemberRecord = {
      sessionKey: member.sessionKey,
      name: member.name,
      agentId: member.agentId,
      agentType: member.agentType,
      status: member.status,
      joinedAt: member.joinedAt,
    };
    if (member.model !== undefined) record.model = member.model;
    if (member.tools !== undefined) record.tools = member.tools;

    this.membersCache.set(member.sessionKey, record);
    await this.persistMembers();
  }

  async listMembers(): Promise<TeammateDefinition[]> {
    await this.ensureLoaded();

    const records = Array.from(this.membersCache.values());
    // Sort by joinedAt ascending
    records.sort((a, b) => a.joinedAt - b.joinedAt);

    return records.map((r) => this.mapRecordToMember(r));
  }

  async updateMemberStatus(
    sessionKey: string,
    status: TeammateDefinition["status"]
  ): Promise<boolean> {
    await this.ensureLoaded();

    const record = this.membersCache.get(sessionKey);
    if (!record) {
      return false;
    }

    record.status = status;
    await this.persistMembers();

    return true;
  }

  async removeMember(sessionKey: string): Promise<boolean> {
    await this.ensureLoaded();

    const deleted = this.membersCache.delete(sessionKey);
    if (deleted) {
      await this.persistMembers();
    }
    return deleted;
  }
}
