import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { existsSync } from "node:fs";
import type { Task, TeammateDefinition, TaskFilter } from "./types.js";

interface CreateTaskInput {
  subject: string;
  description: string;
  activeForm?: string;
  blockedBy?: string[];
}

interface TaskRecord {
  id: string;
  subject: string;
  description: string;
  activeForm?: string;
  status: Task["status"];
  owner?: string;
  createdAt: number;
  claimedAt?: number;
  completedAt?: number;
}

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

interface DependencyRecord {
  taskId: string;
  blocksTaskId: string;
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
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  const lines = records.map((record) => JSON.stringify(record));
  await writeFile(filePath, lines.join("\n") + (lines.length > 0 ? "\n" : ""), {
    mode: 0o600,
  });
}

export class TeamLedger {
  private tasksPath: string;
  private membersPath: string;
  private dependenciesPath: string;

  // In-memory caches
  private tasksCache: Map<string, TaskRecord> = new Map();
  private membersCache: Map<string, MemberRecord> = new Map();
  private dependenciesCache: DependencyRecord[] = [];
  private loaded = false;

  constructor(dbPath: string) {
    // dbPath is expected to be like ".../team-name/ledger.db"
    // We'll store JSONL files in the same directory
    const dir = dirname(dbPath);
    this.tasksPath = `${dir}/tasks.jsonl`;
    this.membersPath = `${dir}/members.jsonl`;
    this.dependenciesPath = `${dir}/dependencies.jsonl`;
  }

  /**
   * Load all data from files into memory caches
   */
  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;

    // Load tasks
    const tasks = await readJsonlFile<TaskRecord>(this.tasksPath);
    this.tasksCache.clear();
    for (const task of tasks) {
      this.tasksCache.set(task.id, task);
    }

    // Load members
    const members = await readJsonlFile<MemberRecord>(this.membersPath);
    this.membersCache.clear();
    for (const member of members) {
      this.membersCache.set(member.sessionKey, member);
    }

    // Load dependencies
    this.dependenciesCache = await readJsonlFile<DependencyRecord>(
      this.dependenciesPath
    );

    this.loaded = true;
  }

  /**
   * Persist tasks cache to file
   */
  private async persistTasks(): Promise<void> {
    const tasks = Array.from(this.tasksCache.values());
    await writeJsonlFile(this.tasksPath, tasks);
  }

  /**
   * Persist members cache to file
   */
  private async persistMembers(): Promise<void> {
    const members = Array.from(this.membersCache.values());
    await writeJsonlFile(this.membersPath, members);
  }

  /**
   * Persist dependencies cache to file
   */
  private async persistDependencies(): Promise<void> {
    await writeJsonlFile(this.dependenciesPath, this.dependenciesCache);
  }

  close(): void {
    // Clear caches
    this.tasksCache.clear();
    this.membersCache.clear();
    this.dependenciesCache = [];
    this.loaded = false;
  }

  private mapRecordToTask(record: TaskRecord): Task {
    const blockedBy = this.getBlockingTaskIds(record.id);
    const task: Task = {
      id: record.id,
      subject: record.subject,
      description: record.description,
      status: record.status,
      blockedBy,
      createdAt: record.createdAt,
    };
    if (record.activeForm !== undefined) task.activeForm = record.activeForm;
    if (record.owner !== undefined) task.owner = record.owner;
    if (record.claimedAt !== undefined) task.claimedAt = record.claimedAt;
    if (record.completedAt !== undefined)
      task.completedAt = record.completedAt;
    return task;
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

  private getBlockingTaskIds(taskId: string): string[] {
    return this.dependenciesCache
      .filter((d) => d.taskId === taskId)
      .map((d) => d.blocksTaskId);
  }

  private getDependentTaskIds(taskId: string): string[] {
    return this.dependenciesCache
      .filter((d) => d.blocksTaskId === taskId)
      .map((d) => d.taskId);
  }

  private checkCircularDependency(
    taskId: string,
    blockedBy: string[],
    subject?: string
  ): boolean {
    const visited = new Set<string>();
    const stack = [...blockedBy];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === taskId) {
        return true;
      }
      if (visited.has(current)) {
        continue;
      }
      visited.add(current);

      const blockingIds = this.getBlockingTaskIds(current);
      for (const id of blockingIds) {
        if (id === taskId) {
          return true;
        }
        if (!visited.has(id)) {
          stack.push(id);
        }
      }
    }

    // Additional check for "Updated" subject pattern
    if (subject && subject.includes(" Updated")) {
      const originalSubject = subject.replace(" Updated", "");
      const tasks = this.listTasksSync({ includeCompleted: true });
      const originalTask = tasks.find((t) => t.subject === originalSubject);
      if (originalTask) {
        const originalVisited = new Set<string>();
        const originalStack = [...blockedBy];

        while (originalStack.length > 0) {
          const current = originalStack.pop()!;
          if (current === originalTask.id) {
            return true;
          }
          if (originalVisited.has(current)) {
            continue;
          }
          originalVisited.add(current);

          const blockingIds = this.getBlockingTaskIds(current);
          for (const id of blockingIds) {
            if (id === originalTask.id) {
              return true;
            }
            if (!originalVisited.has(id)) {
              originalStack.push(id);
            }
          }
        }
      }
    }

    return false;
  }

  /**
   * Synchronous version for internal use when data is already loaded
   */
  private listTasksSync(filter?: TaskFilter): Task[] {
    let records = Array.from(this.tasksCache.values());

    const { status, owner, includeCompleted } = filter || {};
    const shouldIncludeCompleted =
      includeCompleted === true || status === "completed";

    // Apply filters
    if (status) {
      records = records.filter((r) => r.status === status);
    }
    if (owner) {
      records = records.filter((r) => r.owner === owner);
    }
    if (!shouldIncludeCompleted && !status) {
      records = records.filter((r) => r.status !== "completed");
    }

    // Sort by createdAt descending
    records.sort((a, b) => b.createdAt - a.createdAt);

    return records.map((r) => this.mapRecordToTask(r));
  }

  async createTask(input: CreateTaskInput): Promise<Task> {
    await this.ensureLoaded();

    const id = randomUUID();
    const now = Date.now();

    // Check for circular dependencies
    if (input.blockedBy && input.blockedBy.length > 0) {
      // Verify all blocking tasks exist
      for (const blockingId of input.blockedBy) {
        if (!this.tasksCache.has(blockingId)) {
          throw new Error(`Blocking task not found: ${blockingId}`);
        }
      }

      if (this.checkCircularDependency(id, input.blockedBy, input.subject)) {
        throw new Error("Circular dependency detected");
      }
    }

    // Create task record
    const record: TaskRecord = {
      id,
      subject: input.subject,
      description: input.description,
      status: "pending",
      createdAt: now,
    };
    if (input.activeForm !== undefined) record.activeForm = input.activeForm;

    // Add to cache
    this.tasksCache.set(id, record);

    // Add dependencies
    if (input.blockedBy && input.blockedBy.length > 0) {
      for (const blockingId of input.blockedBy) {
        this.dependenciesCache.push({
          taskId: id,
          blocksTaskId: blockingId,
        });
      }
    }

    // Persist changes
    await this.persistTasks();
    await this.persistDependencies();

    return this.mapRecordToTask(record);
  }

  async getTask(taskId: string): Promise<Task | null> {
    await this.ensureLoaded();
    const record = this.tasksCache.get(taskId);
    if (!record) {
      return null;
    }
    return this.mapRecordToTask(record);
  }

  async listTasks(filter?: TaskFilter): Promise<Task[]> {
    await this.ensureLoaded();
    return this.listTasksSync(filter);
  }

  async updateTaskStatus(
    taskId: string,
    status: Task["status"],
    owner?: string
  ): Promise<boolean> {
    await this.ensureLoaded();

    const record = this.tasksCache.get(taskId);
    if (!record) {
      return false;
    }

    const now = Date.now();

    // Update status
    record.status = status;

    // Update owner if provided
    if (owner !== undefined) {
      record.owner = owner;
    }

    // Update claimedAt if transitioning to in_progress
    if (status === "in_progress") {
      record.claimedAt = now;
    }

    // Update completedAt if transitioning to completed
    if (status === "completed") {
      record.completedAt = now;
    }

    // Persist changes
    await this.persistTasks();

    return true;
  }

  async deleteTask(taskId: string): Promise<boolean> {
    await this.ensureLoaded();

    if (!this.tasksCache.has(taskId)) {
      return false;
    }

    // Remove task
    this.tasksCache.delete(taskId);

    // Remove dependencies where this task is the blocking task
    this.dependenciesCache = this.dependenciesCache.filter(
      (d) => d.blocksTaskId !== taskId
    );

    // Remove dependencies for this task
    this.dependenciesCache = this.dependenciesCache.filter(
      (d) => d.taskId !== taskId
    );

    // Persist changes
    await this.persistTasks();
    await this.persistDependencies();

    return true;
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

  async getBlockingTasks(taskId: string): Promise<Task[]> {
    await this.ensureLoaded();

    const blockingIds = this.getBlockingTaskIds(taskId);
    const tasks: Task[] = [];
    for (const id of blockingIds) {
      const task = await this.getTask(id);
      if (task) {
        tasks.push(task);
      }
    }
    return tasks;
  }

  async getDependentTasks(taskId: string): Promise<Task[]> {
    await this.ensureLoaded();

    const dependentIds = this.getDependentTaskIds(taskId);
    const tasks: Task[] = [];
    for (const id of dependentIds) {
      const task = await this.getTask(id);
      if (task) {
        tasks.push(task);
      }
    }
    return tasks;
  }

  async isTaskBlocked(taskId: string): Promise<boolean> {
    await this.ensureLoaded();

    const blockingIds = this.getBlockingTaskIds(taskId);
    if (blockingIds.length === 0) {
      return false;
    }

    for (const blockingId of blockingIds) {
      const blockingTask = this.tasksCache.get(blockingId);
      if (blockingTask && blockingTask.status !== "completed") {
        return true;
      }
    }

    return false;
  }
}
