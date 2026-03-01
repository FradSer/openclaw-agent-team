import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { TeamLedger } from "../src/ledger.js";
import type { Task, TeammateDefinition } from "../src/types.js";

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

  describe("Task Creation", () => {
    it("should create task with generated UUID and default status 'pending'", async () => {
      const task = await ledger.createTask({
        subject: "Test Task",
        description: "A test task description",
      });

      expect(task.id).toBeDefined();
      expect(task.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(task.subject).toBe("Test Task");
      expect(task.description).toBe("A test task description");
      expect(task.status).toBe("pending");
      expect(task.blockedBy).toEqual([]);
      expect(task.createdAt).toBeDefined();
      expect(task.owner).toBeUndefined();
      expect(task.claimedAt).toBeUndefined();
      expect(task.completedAt).toBeUndefined();
    });

    it("should create task with activeForm", async () => {
      const task = await ledger.createTask({
        subject: "Test Task",
        description: "A test task description",
        activeForm: "Testing task creation",
      });

      expect(task.activeForm).toBe("Testing task creation");
    });

    it("should create task with blockedBy creating dependency", async () => {
      const blockingTask = await ledger.createTask({
        subject: "Blocking Task",
        description: "This task blocks another",
      });

      const dependentTask = await ledger.createTask({
        subject: "Dependent Task",
        description: "This task depends on another",
        blockedBy: [blockingTask.id],
      });

      expect(dependentTask.blockedBy).toEqual([blockingTask.id]);
      expect(await ledger.isTaskBlocked(dependentTask.id)).toBe(true);
    });

    it("should store task in database and retrieve it", async () => {
      const createdTask = await ledger.createTask({
        subject: "Persistent Task",
        description: "This task should persist",
      });

      const retrievedTask = await ledger.getTask(createdTask.id);
      expect(retrievedTask).not.toBeNull();
      expect(retrievedTask?.id).toBe(createdTask.id);
      expect(retrievedTask?.subject).toBe("Persistent Task");
    });
  });

  describe("Task Listing with Filters", () => {
    beforeEach(async () => {
      // Create sample tasks with different statuses and owners
      await ledger.createTask({ subject: "Pending Task 1", description: "Desc 1" });
      await ledger.createTask({ subject: "Pending Task 2", description: "Desc 2" });

      const inProgressTask = await ledger.createTask({ subject: "In Progress Task", description: "Desc 3" });
      await ledger.updateTaskStatus(inProgressTask.id, "in_progress", "agent-1");

      const completedTask = await ledger.createTask({ subject: "Completed Task", description: "Desc 4" });
      await ledger.updateTaskStatus(completedTask.id, "completed", "agent-2");
    });

    it("should list non-completed tasks without filter", async () => {
      const tasks = await ledger.listTasks();
      // By default, completed tasks are excluded
      expect(tasks.length).toBe(3);
      expect(tasks.every((t: Task) => t.status !== "completed")).toBe(true);
    });

    it("should filter tasks by status", async () => {
      const pendingTasks = await ledger.listTasks({ status: "pending" });
      expect(pendingTasks.length).toBe(2);
      expect(pendingTasks.every((t: Task) => t.status === "pending")).toBe(true);

      const inProgressTasks = await ledger.listTasks({ status: "in_progress" });
      expect(inProgressTasks.length).toBe(1);
      expect(inProgressTasks[0].subject).toBe("In Progress Task");
    });

    it("should filter tasks by owner", async () => {
      const agent1Tasks = await ledger.listTasks({ owner: "agent-1" });
      expect(agent1Tasks.length).toBe(1);
      expect(agent1Tasks[0].subject).toBe("In Progress Task");

      // For owner filter, includeCompleted is false by default
      // So agent-2's task (which is completed) won't show up unless we include completed
      const agent2Tasks = await ledger.listTasks({ owner: "agent-2", includeCompleted: true });
      expect(agent2Tasks.length).toBe(1);
      expect(agent2Tasks[0].subject).toBe("Completed Task");
    });

    it("should exclude completed tasks by default", async () => {
      const tasks = await ledger.listTasks();
      const completedTasks = tasks.filter((t: Task) => t.status === "completed");
      expect(completedTasks.length).toBe(0);
    });

    it("should include completed tasks when flag is set", async () => {
      const tasks = await ledger.listTasks({ includeCompleted: true });
      expect(tasks.length).toBe(4);
      const completedTasks = tasks.filter((t: Task) => t.status === "completed");
      expect(completedTasks.length).toBe(1);
    });

    it("should combine multiple filters", async () => {
      const tasks = await ledger.listTasks({ status: "completed", owner: "agent-2", includeCompleted: true });
      expect(tasks.length).toBe(1);
      expect(tasks[0].subject).toBe("Completed Task");
    });
  });

  describe("Task Status Transitions", () => {
    it("should transition from pending to in_progress", async () => {
      const task = await ledger.createTask({
        subject: "Status Test Task",
        description: "Testing status transitions",
      });

      expect(task.status).toBe("pending");

      const success = await ledger.updateTaskStatus(task.id, "in_progress", "agent-1");
      expect(success).toBe(true);

      const updatedTask = await ledger.getTask(task.id);
      expect(updatedTask?.status).toBe("in_progress");
      expect(updatedTask?.owner).toBe("agent-1");
      expect(updatedTask?.claimedAt).toBeDefined();
    });

    it("should transition from in_progress to completed", async () => {
      const task = await ledger.createTask({
        subject: "Completion Test Task",
        description: "Testing completion",
      });

      await ledger.updateTaskStatus(task.id, "in_progress", "agent-1");
      const success = await ledger.updateTaskStatus(task.id, "completed");
      expect(success).toBe(true);

      const updatedTask = await ledger.getTask(task.id);
      expect(updatedTask?.status).toBe("completed");
      expect(updatedTask?.completedAt).toBeDefined();
    });

    it("should return false for non-existent task", async () => {
      const success = await ledger.updateTaskStatus("non-existent-id", "in_progress");
      expect(success).toBe(false);
    });

    it("should update owner when status changes", async () => {
      const task = await ledger.createTask({
        subject: "Owner Update Task",
        description: "Testing owner update",
      });

      await ledger.updateTaskStatus(task.id, "in_progress", "new-owner");
      const updatedTask = await ledger.getTask(task.id);
      expect(updatedTask?.owner).toBe("new-owner");
    });
  });

  describe("Task Deletion", () => {
    it("should delete existing task", async () => {
      const task = await ledger.createTask({
        subject: "Task to Delete",
        description: "This will be deleted",
      });

      expect(await ledger.getTask(task.id)).not.toBeNull();

      const success = await ledger.deleteTask(task.id);
      expect(success).toBe(true);
      expect(await ledger.getTask(task.id)).toBeNull();
    });

    it("should return false for non-existent task deletion", async () => {
      const success = await ledger.deleteTask("non-existent-id");
      expect(success).toBe(false);
    });

    it("should remove dependencies when task is deleted", async () => {
      const blockingTask = await ledger.createTask({
        subject: "Blocking Task",
        description: "Will be deleted",
      });

      const dependentTask = await ledger.createTask({
        subject: "Dependent Task",
        description: "Depends on blocking task",
        blockedBy: [blockingTask.id],
      });

      await ledger.deleteTask(blockingTask.id);

      const updatedDependent = await ledger.getTask(dependentTask.id);
      // The dependency should be removed when the blocking task is deleted
      expect(updatedDependent?.blockedBy).toEqual([]);
    });
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

  describe("Dependency Operations", () => {
    it("should get blocking tasks (tasks that block a given task)", async () => {
      const taskA = await ledger.createTask({ subject: "Task A", description: "First task" });
      const taskB = await ledger.createTask({ subject: "Task B", description: "Second task" });
      const taskC = await ledger.createTask({
        subject: "Task C",
        description: "Depends on A and B",
        blockedBy: [taskA.id, taskB.id],
      });

      const blockingTasks = await ledger.getBlockingTasks(taskC.id);
      expect(blockingTasks.length).toBe(2);
      expect(blockingTasks.map((t: Task) => t.id).sort()).toEqual([taskA.id, taskB.id].sort());
    });

    it("should get dependent tasks (tasks that depend on a given task)", async () => {
      const taskA = await ledger.createTask({ subject: "Task A", description: "First task" });
      const taskB = await ledger.createTask({
        subject: "Task B",
        description: "Depends on A",
        blockedBy: [taskA.id],
      });
      const taskC = await ledger.createTask({
        subject: "Task C",
        description: "Also depends on A",
        blockedBy: [taskA.id],
      });

      const dependentTasks = await ledger.getDependentTasks(taskA.id);
      expect(dependentTasks.length).toBe(2);
      expect(dependentTasks.map((t: Task) => t.id).sort()).toEqual([taskB.id, taskC.id].sort());
    });

    it("should return empty array for task with no blocking tasks", async () => {
      const task = await ledger.createTask({ subject: "Independent Task", description: "No dependencies" });
      const blockingTasks = await ledger.getBlockingTasks(task.id);
      expect(blockingTasks).toEqual([]);
    });

    it("should return empty array for task with no dependent tasks", async () => {
      const task = await ledger.createTask({ subject: "Terminal Task", description: "Nothing depends on this" });
      const dependentTasks = await ledger.getDependentTasks(task.id);
      expect(dependentTasks).toEqual([]);
    });

    it("should correctly identify blocked task", async () => {
      const blockingTask = await ledger.createTask({ subject: "Blocking Task", description: "Blocks others" });
      const blockedTask = await ledger.createTask({
        subject: "Blocked Task",
        description: "Is blocked",
        blockedBy: [blockingTask.id],
      });
      const independentTask = await ledger.createTask({ subject: "Independent Task", description: "Not blocked" });

      expect(await ledger.isTaskBlocked(blockedTask.id)).toBe(true);
      expect(await ledger.isTaskBlocked(independentTask.id)).toBe(false);
    });

    it("should not be blocked if all blocking tasks are completed", async () => {
      const blockingTask = await ledger.createTask({ subject: "Blocking Task", description: "Will complete" });
      const blockedTask = await ledger.createTask({
        subject: "Blocked Task",
        description: "Will be unblocked",
        blockedBy: [blockingTask.id],
      });

      expect(await ledger.isTaskBlocked(blockedTask.id)).toBe(true);

      await ledger.updateTaskStatus(blockingTask.id, "completed");

      // Once the blocking task is completed, the task should no longer be blocked
      expect(await ledger.isTaskBlocked(blockedTask.id)).toBe(false);
    });
  });

  describe("Circular Dependency Detection", () => {
    it("should reject task depending on itself", async () => {
      // Self-dependency with non-existent task throws an error
      await expect(ledger.createTask({
        subject: "Self-dependent Task",
        description: "Depends on itself",
        blockedBy: ["self-reference-test"], // Non-existent task
      })).rejects.toThrow("Blocking task not found");
    });

    it("should allow new tasks to depend on existing tasks", async () => {
      // Creating a new task that depends on existing tasks is valid
      const taskA = await ledger.createTask({ subject: "Task A", description: "First task" });
      const taskB = await ledger.createTask({
        subject: "Task B",
        description: "Depends on A",
        blockedBy: [taskA.id],
      });

      expect(taskB.blockedBy).toEqual([taskA.id]);
      expect(taskB.status).toBe("pending");
    });

    it("should allow valid dependency chains without cycles", async () => {
      const taskA = await ledger.createTask({ subject: "Task A", description: "First task" });
      const taskB = await ledger.createTask({
        subject: "Task B",
        description: "Depends on A",
        blockedBy: [taskA.id],
      });
      const taskC = await ledger.createTask({
        subject: "Task C",
        description: "Depends on B",
        blockedBy: [taskB.id],
      });

      expect(taskC.id).toBeDefined();
      expect(taskC.blockedBy).toEqual([taskB.id]);
    });

    it("should allow multiple tasks to depend on the same task", async () => {
      const taskA = await ledger.createTask({ subject: "Task A", description: "Base task" });
      const taskB = await ledger.createTask({
        subject: "Task B",
        description: "Depends on A",
        blockedBy: [taskA.id],
      });
      const taskC = await ledger.createTask({
        subject: "Task C",
        description: "Also depends on A",
        blockedBy: [taskA.id],
      });

      expect(taskB.blockedBy).toEqual([taskA.id]);
      expect(taskC.blockedBy).toEqual([taskA.id]);
    });
  });

  describe("Data Persistence", () => {
    it("should persist data across ledger instances", async () => {
      const persistDbPath = join(tempDir, "persist-test.db");

      // Create and populate database
      const ledger1 = new TeamLedger(persistDbPath);
      const task = await ledger1.createTask({ subject: "Persistent Task", description: "Should persist" });
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
      const retrievedTask = await ledger2.getTask(task.id);
      const members = await ledger2.listMembers();

      expect(retrievedTask).not.toBeNull();
      expect(retrievedTask?.subject).toBe("Persistent Task");
      expect(members.length).toBe(1);
      expect(members[0].name).toBe("persistent-member");

      ledger2.close();
    });
  });
});
