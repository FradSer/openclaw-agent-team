import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { createTaskCreateTool } from "../../src/tools/task-create.js";
import { TeamLedger } from "../../src/ledger.js";
import { teamDirectoryExists, createTeamDirectory } from "../../src/storage.js";
import type { Task } from "../../src/types.js";

// Type definitions based on the expected API
interface TaskCreateResponse {
  taskId: string;
  subject: string;
  status: string;
  blocked: boolean;
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

describe("task_create tool", () => {
  let tempDir: string;
  let ctx: PluginContext;
  let ledger: TeamLedger;

  beforeEach(async () => {
    tempDir = join(process.cwd(), "test-temp", `task-create-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
    ctx = {
      teamsDir: tempDir,
      api: {},
    };

    // Create a test team for use in tests
    await createTeamDirectory(tempDir, "test-team");
    const dbPath = join(tempDir, "test-team", "ledger.db");
    ledger = new TeamLedger(dbPath);
  });

  afterEach(async () => {
    ledger.close();
    await rm(join(process.cwd(), "test-temp"), { recursive: true, force: true });
  });

  describe("Given a valid task creation request", () => {
    describe("When creating a task with all fields", () => {
      it("Then should return task with unique ID", async () => {
        const tool = createTaskCreateTool(ctx);
        const result = (await tool.handler({
          team_name: "test-team",
          subject: "Implement feature X",
          description: "Create the new feature for the application",
        })) as TaskCreateResponse;

        // Verify taskId is a valid UUID format
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        expect(result.taskId).toMatch(uuidPattern);
      });

      it("Then should return task with correct default status 'pending'", async () => {
        const tool = createTaskCreateTool(ctx);
        const result = (await tool.handler({
          team_name: "test-team",
          subject: "Implement feature Y",
          description: "Another feature implementation",
        })) as TaskCreateResponse;

        expect(result.status).toBe("pending");
      });

      it("Then should return subject matching input", async () => {
        const tool = createTaskCreateTool(ctx);
        const result = (await tool.handler({
          team_name: "test-team",
          subject: "Unique task subject",
          description: "Task description",
        })) as TaskCreateResponse;

        expect(result.subject).toBe("Unique task subject");
      });

      it("Then should appear in task_list after creation", async () => {
        const tool = createTaskCreateTool(ctx);
        const result = (await tool.handler({
          team_name: "test-team",
          subject: "Task for listing",
          description: "This task should be listed",
        })) as TaskCreateResponse;

        // Verify task appears in ledger
        const task = await ledger.getTask(result.taskId);
        expect(task).not.toBeNull();
        expect(task?.subject).toBe("Task for listing");
      });
    });

    describe("When creating a task with optional activeForm", () => {
      it("Then should store activeForm in the task", async () => {
        const tool = createTaskCreateTool(ctx);
        const result = (await tool.handler({
          team_name: "test-team",
          subject: "Task with activeForm",
          description: "Task description",
          activeForm: "Working on the feature",
        })) as TaskCreateResponse;

        const task = await ledger.getTask(result.taskId);
        expect(task?.activeForm).toBe("Working on the feature");
      });
    });

    describe("When creating a task with dependencies (blockedBy)", () => {
      it("Then should create dependency when blockedBy is provided", async () => {
        // First create a blocking task
        const blockingTask = await ledger.createTask({
          subject: "Blocking Task",
          description: "This task must complete first",
        });

        const tool = createTaskCreateTool(ctx);
        const result = (await tool.handler({
          team_name: "test-team",
          subject: "Dependent Task",
          description: "This depends on another task",
          blockedBy: [blockingTask.id],
        })) as TaskCreateResponse;

        // Verify with fresh ledger instance
        const verifyLedger = new TeamLedger(join(tempDir, "test-team", "ledger.db"));
        const task = await verifyLedger.getTask(result.taskId);
        verifyLedger.close();
        expect(task?.blockedBy).toContain(blockingTask.id);
      });

      it("Then should show task as blocked when blockedBy has incomplete tasks", async () => {
        // First create a blocking task that is not completed
        const blockingTask = await ledger.createTask({
          subject: "Incomplete Blocking Task",
          description: "This task is still in progress",
        });

        const tool = createTaskCreateTool(ctx);
        const result = (await tool.handler({
          team_name: "test-team",
          subject: "Blocked Task",
          description: "This is blocked",
          blockedBy: [blockingTask.id],
        })) as TaskCreateResponse;

        expect(result.blocked).toBe(true);
      });

      it("Then should not be blocked if all blocking tasks are completed", async () => {
        // Create and complete a blocking task
        const blockingTask = await ledger.createTask({
          subject: "Completed Blocking Task",
          description: "This task is done",
        });
        await ledger.updateTaskStatus(blockingTask.id, "completed");

        const tool = createTaskCreateTool(ctx);
        const result = (await tool.handler({
          team_name: "test-team",
          subject: "Unblocked Task",
          description: "This should not be blocked",
          blockedBy: [blockingTask.id],
        })) as TaskCreateResponse;

        expect(result.blocked).toBe(false);
      });
    });
  });

  describe("Given a circular dependency attempt", () => {
    describe("When creating a task that would create a cycle", () => {
      it("Then should allow valid dependency chains", async () => {
        // Create task A
        const taskA = await ledger.createTask({
          subject: "Task A",
          description: "First task",
        });

        // Create task B that depends on A
        const taskB = await ledger.createTask({
          subject: "Task B",
          description: "Second task",
          blockedBy: [taskA.id],
        });

        // Create task C that depends on B (valid chain A -> B -> C)
        const tool = createTaskCreateTool(ctx);
        const result = (await tool.handler({
          team_name: "test-team",
          subject: "Task C",
          description: "Third task in chain",
          blockedBy: [taskB.id],
        })) as TaskCreateResponse;

        expect(result).toHaveProperty("taskId");
        expect(result.status).toBe("pending");
      });
    });

    describe("When creating a task with non-existent blocking task", () => {
      it("Then should return BLOCKING_TASK_NOT_FOUND error", async () => {
        const tool = createTaskCreateTool(ctx);

        // Try to create task with non-existent blocking task ID
        const result = await tool.handler({
          team_name: "test-team",
          subject: "Task with bad dependency",
          description: "This depends on non-existent task",
          blockedBy: ["non-existent-task-id"],
        });

        expect(result).toHaveProperty("error");
        expect((result as ToolError).error.code).toBe("BLOCKING_TASK_NOT_FOUND");
      });
    });
  });

  describe("Given a non-existent team", () => {
    describe("When attempting to create a task in a non-existent team", () => {
      it("Then should return TEAM_NOT_FOUND error", async () => {
        const tool = createTaskCreateTool(ctx);
        const result = (await tool.handler({
          team_name: "non-existent-team",
          subject: "Orphan Task",
          description: "This team does not exist",
        })) as ToolError;

        expect(result).toHaveProperty("error");
        expect(result.error.code).toBe("TEAM_NOT_FOUND");
        expect(result.error.message).toMatch(/not found/i);
      });
    });
  });

  describe("Given missing required fields", () => {
    describe("When creating a task without subject", () => {
      it("Then should return MISSING_SUBJECT error", async () => {
        const tool = createTaskCreateTool(ctx);
        const result = (await tool.handler({
          team_name: "test-team",
          subject: "",
          description: "Missing subject",
        })) as ToolError;

        expect(result).toHaveProperty("error");
        expect(result.error.code).toBe("MISSING_SUBJECT");
      });
    });

    describe("When creating a task without description", () => {
      it("Then should return MISSING_DESCRIPTION error", async () => {
        const tool = createTaskCreateTool(ctx);
        const result = (await tool.handler({
          team_name: "test-team",
          subject: "Task without description",
          description: "",
        })) as ToolError;

        expect(result).toHaveProperty("error");
        expect(result.error.code).toBe("MISSING_DESCRIPTION");
      });
    });
  });

  describe("Given invalid blockedBy task IDs", () => {
    describe("When creating a task with non-existent blocking task", () => {
      it("Then should return BLOCKING_TASK_NOT_FOUND error", async () => {
        const tool = createTaskCreateTool(ctx);
        const result = (await tool.handler({
          team_name: "test-team",
          subject: "Task with invalid dependency",
          description: "Depends on non-existent task",
          blockedBy: ["non-existent-task-id"],
        })) as ToolError;

        expect(result).toHaveProperty("error");
        expect(result.error.code).toBe("BLOCKING_TASK_NOT_FOUND");
      });
    });
  });

  describe("Tool schema", () => {
    it("should have correct tool name", () => {
      const tool = createTaskCreateTool(ctx);
      expect(tool.name).toBe("task_create");
    });

    it("should have description", () => {
      const tool = createTaskCreateTool(ctx);
      expect(tool.description).toBeDefined();
      expect(tool.description.length).toBeGreaterThan(0);
    });

    it("should have schema defined", () => {
      const tool = createTaskCreateTool(ctx);
      expect(tool.schema).toBeDefined();
    });
  });
});
