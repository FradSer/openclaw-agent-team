import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { createTaskListTool } from "../../src/tools/task-list.js";
import { TeamLedger } from "../../src/ledger.js";
import { createTeamDirectory } from "../../src/storage.js";
import type { Task, TaskFilter } from "../../src/types.js";

// Type definitions based on the expected API
interface TaskListResponse {
  tasks: TaskListItem[];
  count: number;
}

interface TaskListItem {
  id: string;
  subject: string;
  status: string;
  owner?: string;
  blocked: boolean;
  createdAt: number;
  completedAt?: number;
}

interface ToolError {
  error: {
    code: string;
    message: string;
  };
}

interface PluginContext {
  teamsDir: string;
  api?: unknown;
}

describe("task_list tool", () => {
  let tempDir: string;
  let ctx: PluginContext;
  let ledger: TeamLedger;

  beforeEach(async () => {
    tempDir = join(process.cwd(), "test-temp", `task-list-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
    ctx = {
      teamsDir: tempDir,
      api: {},
    };

    // Create a test team for use in tests
    await createTeamDirectory(tempDir, "test-team");
    const dbPath = join(tempDir, "test-team", "ledger.db");
    ledger = new TeamLedger(dbPath);

    // Create 5 sample tasks with various states for listing tests
    // Task 1: Pending, no owner, not blocked
    await ledger.createTask({
      subject: "Pending Task 1",
      description: "First pending task",
    });

    // Task 2: Pending, owned by agent-1, not blocked
    const task2 = await ledger.createTask({
      subject: "Pending Task 2",
      description: "Second pending task",
    });
    await ledger.updateTaskStatus(task2.id, "pending", "agent-1");

    // Task 3: In Progress, owned by agent-1
    const task3 = await ledger.createTask({
      subject: "In Progress Task",
      description: "Task in progress",
    });
    await ledger.updateTaskStatus(task3.id, "in_progress", "agent-1");

    // Task 4: Completed, owned by agent-2
    const task4 = await ledger.createTask({
      subject: "Completed Task",
      description: "Task that is done",
    });
    await ledger.updateTaskStatus(task4.id, "in_progress", "agent-2");
    await ledger.updateTaskStatus(task4.id, "completed");

    // Task 5: Blocked by Task 4 (even though completed, for testing blocked status)
    const blockingTask = await ledger.createTask({
      subject: "Active Blocking Task",
      description: "This blocks another",
    });
    await ledger.createTask({
      subject: "Blocked Task",
      description: "This is blocked",
      blockedBy: [blockingTask.id],
    });
  });

  afterEach(async () => {
    ledger.close();
    await rm(join(process.cwd(), "test-temp"), { recursive: true, force: true });
  });

  describe("Given a team with tasks", () => {
    describe("When listing all tasks without filters", () => {
      it("Then should return correct count of non-completed tasks", async () => {
        const tool = createTaskListTool(ctx);
        const result = (await tool.handler({
          team_name: "test-team",
        })) as TaskListResponse;

        // Should return 5 tasks (excluding completed by default)
        // Actually: Pending Task 1, Pending Task 2, In Progress Task, Active Blocking Task, Blocked Task = 5
        expect(result.count).toBe(5);
      });

      it("Then should return tasks with all required fields", async () => {
        const tool = createTaskListTool(ctx);
        const result = (await tool.handler({
          team_name: "test-team",
        })) as TaskListResponse;

        expect(result.tasks).toBeDefined();
        expect(Array.isArray(result.tasks)).toBe(true);

        for (const task of result.tasks) {
          expect(task).toHaveProperty("id");
          expect(task).toHaveProperty("subject");
          expect(task).toHaveProperty("status");
          expect(task).toHaveProperty("blocked");
          expect(task).toHaveProperty("createdAt");
        }
      });

      it("Then should include blocked status for each task", async () => {
        const tool = createTaskListTool(ctx);
        const result = (await tool.handler({
          team_name: "test-team",
        })) as TaskListResponse;

        // Find the blocked task
        const blockedTask = result.tasks.find((t) => t.subject === "Blocked Task");
        expect(blockedTask).toBeDefined();
        expect(blockedTask?.blocked).toBe(true);

        // Find a non-blocked task
        const nonBlockedTask = result.tasks.find((t) => t.subject === "Pending Task 1");
        expect(nonBlockedTask).toBeDefined();
        expect(nonBlockedTask?.blocked).toBe(false);
      });

      it("Then should include owner for tasks that have been claimed", async () => {
        const tool = createTaskListTool(ctx);
        const result = (await tool.handler({
          team_name: "test-team",
        })) as TaskListResponse;

        // Find task owned by agent-1
        const ownedTask = result.tasks.find((t) => t.subject === "In Progress Task");
        expect(ownedTask).toBeDefined();
        expect(ownedTask?.owner).toBe("agent-1");
      });
    });
  });

  describe("Given a filter by status", () => {
    describe("When filtering by status 'pending'", () => {
      it("Then should return only pending tasks", async () => {
        const tool = createTaskListTool(ctx);
        const result = (await tool.handler({
          team_name: "test-team",
          status: "pending",
        })) as TaskListResponse;

        expect(result.tasks.length).toBeGreaterThan(0);
        expect(result.tasks.every((t) => t.status === "pending")).toBe(true);
      });
    });

    describe("When filtering by status 'in_progress'", () => {
      it("Then should return only in_progress tasks", async () => {
        const tool = createTaskListTool(ctx);
        const result = (await tool.handler({
          team_name: "test-team",
          status: "in_progress",
        })) as TaskListResponse;

        expect(result.tasks.length).toBe(1);
        expect(result.tasks[0].subject).toBe("In Progress Task");
      });
    });

    describe("When filtering by status 'completed'", () => {
      it("Then should return only completed tasks", async () => {
        const tool = createTaskListTool(ctx);
        const result = (await tool.handler({
          team_name: "test-team",
          status: "completed",
        })) as TaskListResponse;

        expect(result.tasks.length).toBe(1);
        expect(result.tasks[0].subject).toBe("Completed Task");
      });
    });
  });

  describe("Given a filter by owner", () => {
    describe("When filtering by owner 'agent-1'", () => {
      it("Then should return only tasks owned by agent-1", async () => {
        const tool = createTaskListTool(ctx);
        const result = (await tool.handler({
          team_name: "test-team",
          owner: "agent-1",
        })) as TaskListResponse;

        expect(result.tasks.length).toBe(2); // Pending Task 2 and In Progress Task
        expect(result.tasks.every((t) => t.owner === "agent-1")).toBe(true);
      });
    });

    describe("When filtering by owner 'agent-2'", () => {
      it("Then should return only tasks owned by agent-2", async () => {
        const tool = createTaskListTool(ctx);
        const result = (await tool.handler({
          team_name: "test-team",
          owner: "agent-2",
          includeCompleted: true,
        })) as TaskListResponse;

        // agent-2 owns Completed Task (needs includeCompleted since it's completed)
        expect(result.tasks.some((t) => t.owner === "agent-2")).toBe(true);
      });
    });

    describe("When filtering by non-existent owner", () => {
      it("Then should return empty array", async () => {
        const tool = createTaskListTool(ctx);
        const result = (await tool.handler({
          team_name: "test-team",
          owner: "non-existent-agent",
        })) as TaskListResponse;

        expect(result.tasks).toEqual([]);
        expect(result.count).toBe(0);
      });
    });
  });

  describe("Given includeCompleted flag", () => {
    describe("When includeCompleted is false (default)", () => {
      it("Then should exclude completed tasks", async () => {
        const tool = createTaskListTool(ctx);
        const result = (await tool.handler({
          team_name: "test-team",
          includeCompleted: false,
        })) as TaskListResponse;

        expect(result.tasks.every((t) => t.status !== "completed")).toBe(true);
      });
    });

    describe("When includeCompleted is true", () => {
      it("Then should include completed tasks with completion time", async () => {
        const tool = createTaskListTool(ctx);
        const result = (await tool.handler({
          team_name: "test-team",
          includeCompleted: true,
        })) as TaskListResponse;

        const completedTask = result.tasks.find((t) => t.status === "completed");
        expect(completedTask).toBeDefined();
        expect(completedTask?.completedAt).toBeDefined();
        expect(typeof completedTask?.completedAt).toBe("number");
      });

      it("Then should return all tasks including completed", async () => {
        const tool = createTaskListTool(ctx);
        const result = (await tool.handler({
          team_name: "test-team",
          includeCompleted: true,
        })) as TaskListResponse;

        // Should have 6 tasks total (5 non-completed + 1 completed)
        expect(result.count).toBe(6);
      });
    });
  });

  describe("Given combined filters", () => {
    describe("When filtering by both status and owner", () => {
      it("Then should return tasks matching both filters", async () => {
        const tool = createTaskListTool(ctx);
        const result = (await tool.handler({
          team_name: "test-team",
          status: "in_progress",
          owner: "agent-1",
        })) as TaskListResponse;

        expect(result.tasks.length).toBe(1);
        expect(result.tasks[0].subject).toBe("In Progress Task");
        expect(result.tasks[0].owner).toBe("agent-1");
      });
    });

    describe("When filtering by status, owner, and includeCompleted", () => {
      it("Then should combine all filters correctly", async () => {
        const tool = createTaskListTool(ctx);
        const result = (await tool.handler({
          team_name: "test-team",
          status: "completed",
          owner: "agent-2",
          includeCompleted: true,
        })) as TaskListResponse;

        expect(result.tasks.length).toBe(1);
        expect(result.tasks[0].subject).toBe("Completed Task");
      });
    });
  });

  describe("Given an empty team", () => {
    describe("When listing tasks from empty team", () => {
      it("Then should return empty array", async () => {
        // Create a new empty team
        await createTeamDirectory(tempDir, "empty-team");
        const emptyDbPath = join(tempDir, "empty-team", "ledger.db");
        const emptyLedger = new TeamLedger(emptyDbPath);
        emptyLedger.close();

        const tool = createTaskListTool(ctx);
        const result = (await tool.handler({
          team_name: "empty-team",
        })) as TaskListResponse;

        expect(result.tasks).toEqual([]);
        expect(result.count).toBe(0);
      });
    });
  });

  describe("Given a non-existent team", () => {
    describe("When listing tasks from non-existent team", () => {
      it("Then should return TEAM_NOT_FOUND error", async () => {
        const tool = createTaskListTool(ctx);
        const result = (await tool.handler({
          team_name: "non-existent-team",
        })) as ToolError;

        expect(result).toHaveProperty("error");
        expect(result.error.code).toBe("TEAM_NOT_FOUND");
        expect(result.error.message).toMatch(/not found/i);
      });
    });
  });

  describe("Tool schema", () => {
    it("should have correct tool name", () => {
      const tool = createTaskListTool(ctx);
      expect(tool.name).toBe("task_list");
    });

    it("should have description", () => {
      const tool = createTaskListTool(ctx);
      expect(tool.description).toBeDefined();
      expect(tool.description.length).toBeGreaterThan(0);
    });

    it("should have schema defined", () => {
      const tool = createTaskListTool(ctx);
      expect(tool.schema).toBeDefined();
    });
  });
});
