import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { createTaskCompleteTool } from "../../src/tools/task-complete.js";
import { TeamLedger } from "../../src/ledger.js";
import { createTeamDirectory } from "../../src/storage.js";
import type { Task } from "../../src/types.js";

// Type definitions based on the expected API
interface TaskCompleteResponse {
  taskId: string;
  status: "completed";
  completedAt: number;
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

interface SessionContext {
  sessionKey: string;
  teammateName: string;
  teamName: string;
}

describe("task_complete tool", () => {
  let tempDir: string;
  let ctx: PluginContext;
  let ledger: TeamLedger;
  let sessionCtx: SessionContext;

  beforeEach(async () => {
    tempDir = join(process.cwd(), "test-temp", `task-complete-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
    ctx = {
      teamsDir: tempDir,
      api: {},
    };

    // Create a test team for use in tests
    await createTeamDirectory(tempDir, "test-team");
    const dbPath = join(tempDir, "test-team", "ledger.db");
    ledger = new TeamLedger(dbPath);

    // Default session context
    sessionCtx = {
      sessionKey: "session-agent-1",
      teammateName: "agent-1",
      teamName: "test-team",
    };
  });

  afterEach(async () => {
    ledger.close();
    await rm(join(process.cwd(), "test-temp"), { recursive: true, force: true });
  });

  describe("Given a task claimed by the current agent", () => {
    describe("When completing the task", () => {
      it("Then should update status to 'completed'", async () => {
        // Create and claim a task
        const task = await ledger.createTask({
          subject: "Task to Complete",
          description: "This task will be completed",
        });
        await ledger.updateTaskStatus(task.id, "in_progress", sessionCtx.sessionKey);

        const tool = createTaskCompleteTool(ctx, sessionCtx);
        const result = (await tool.handler({
          team_name: "test-team",
          task_id: task.id,
        })) as TaskCompleteResponse;

        expect(result.status).toBe("completed");

        // Verify with fresh ledger instance
        const verifyLedger = new TeamLedger(join(tempDir, "test-team", "ledger.db"));
        const updatedTask = await verifyLedger.getTask(task.id);
        verifyLedger.close();
        expect(updatedTask?.status).toBe("completed");
      });

      it("Then should set completedAt timestamp", async () => {
        const task = await ledger.createTask({
          subject: "Task for Timestamp",
          description: "This task will have a completedAt",
        });
        await ledger.updateTaskStatus(task.id, "in_progress", sessionCtx.sessionKey);

        const beforeComplete = Date.now();
        const tool = createTaskCompleteTool(ctx, sessionCtx);
        const result = (await tool.handler({
          team_name: "test-team",
          task_id: task.id,
        })) as TaskCompleteResponse;
        const afterComplete = Date.now();

        expect(result.completedAt).toBeDefined();
        expect(result.completedAt).toBeGreaterThanOrEqual(beforeComplete);
        expect(result.completedAt).toBeLessThanOrEqual(afterComplete);

        // Verify with fresh ledger instance
        const verifyLedger = new TeamLedger(join(tempDir, "test-team", "ledger.db"));
        const updatedTask = await verifyLedger.getTask(task.id);
        verifyLedger.close();
        expect(updatedTask?.completedAt).toBeDefined();
        expect(updatedTask?.completedAt).toBeGreaterThanOrEqual(beforeComplete);
      });

      it("Then should return taskId in response", async () => {
        const task = await ledger.createTask({
          subject: "Task for ID",
          description: "This task will return its ID",
        });
        await ledger.updateTaskStatus(task.id, "in_progress", sessionCtx.sessionKey);

        const tool = createTaskCompleteTool(ctx, sessionCtx);
        const result = (await tool.handler({
          team_name: "test-team",
          task_id: task.id,
        })) as TaskCompleteResponse;

        expect(result.taskId).toBe(task.id);
      });
    });
  });

  describe("Given a task owned by another agent", () => {
    describe("When attempting to complete the task", () => {
      it("Then should return NOT_TASK_OWNER error", async () => {
        // Create and claim a task with a different session
        const task = await ledger.createTask({
          subject: "Task Owned by Other",
          description: "This task is owned by another agent",
        });
        await ledger.updateTaskStatus(task.id, "in_progress", "session-other-agent");

        const tool = createTaskCompleteTool(ctx, sessionCtx);
        const result = (await tool.handler({
          team_name: "test-team",
          task_id: task.id,
        })) as ToolError;

        expect(result).toHaveProperty("error");
        expect(result.error.code).toBe("NOT_TASK_OWNER");
      });

      it("Then should include current owner in error message", async () => {
        const task = await ledger.createTask({
          subject: "Task with Owner Info",
          description: "This task has an owner",
        });
        await ledger.updateTaskStatus(task.id, "in_progress", "session-other-agent");

        const tool = createTaskCompleteTool(ctx, sessionCtx);
        const result = (await tool.handler({
          team_name: "test-team",
          task_id: task.id,
        })) as ToolError;

        expect(result.error.message).toContain("session-other-agent");
      });
    });
  });

  describe("Given a task that has dependent (blocked) tasks", () => {
    describe("When completing the blocking task", () => {
      it("Then should unblock dependent tasks", async () => {
        // Create a blocking task
        const blockingTask = await ledger.createTask({
          subject: "Blocking Task",
          description: "This task blocks another",
        });
        await ledger.updateTaskStatus(blockingTask.id, "in_progress", sessionCtx.sessionKey);

        // Create a dependent task
        const dependentTask = await ledger.createTask({
          subject: "Dependent Task",
          description: "This task depends on the blocking task",
          blockedBy: [blockingTask.id],
        });

        // Verify dependent task is blocked
        expect(await ledger.isTaskBlocked(dependentTask.id)).toBe(true);

        // Complete the blocking task
        const tool = createTaskCompleteTool(ctx, sessionCtx);
        await tool.handler({
          team_name: "test-team",
          task_id: blockingTask.id,
        });

        // Verify dependent task is now unblocked with fresh ledger
        const verifyLedger = new TeamLedger(join(tempDir, "test-team", "ledger.db"));
        const isBlocked = await verifyLedger.isTaskBlocked(dependentTask.id);
        verifyLedger.close();
        expect(isBlocked).toBe(false);
      });

      it("Then dependent task becomes claimable after blocking task completes", async () => {
        // Create and complete a blocking task
        const blockingTask = await ledger.createTask({
          subject: "Blocker to Complete",
          description: "This will be completed",
        });
        await ledger.updateTaskStatus(blockingTask.id, "in_progress", sessionCtx.sessionKey);

        const dependentTask = await ledger.createTask({
          subject: "Task to be Unblocked",
          description: "Will be claimable after blocker completes",
          blockedBy: [blockingTask.id],
        });

        // Complete the blocking task
        const tool = createTaskCompleteTool(ctx, sessionCtx);
        await tool.handler({
          team_name: "test-team",
          task_id: blockingTask.id,
        });

        // Now the dependent task should be claimable
        // Create a claim tool to verify
        const { createTaskClaimTool } = await import("../../src/tools/task-claim.js");
        const claimTool = createTaskClaimTool(ctx, sessionCtx);
        const claimResult = await claimTool.handler({
          team_name: "test-team",
          task_id: dependentTask.id,
        });

        // Should successfully claim (not return an error)
        expect(claimResult).not.toHaveProperty("error");
        expect((claimResult as TaskCompleteResponse).status).toBe("in_progress");
      });

      it("Then should unblock all dependent tasks", async () => {
        // Create a blocking task
        const blockingTask = await ledger.createTask({
          subject: "Multi-Blocker",
          description: "Blocks multiple tasks",
        });
        await ledger.updateTaskStatus(blockingTask.id, "in_progress", sessionCtx.sessionKey);

        // Create multiple dependent tasks
        const dependent1 = await ledger.createTask({
          subject: "Dependent 1",
          description: "First dependent",
          blockedBy: [blockingTask.id],
        });
        const dependent2 = await ledger.createTask({
          subject: "Dependent 2",
          description: "Second dependent",
          blockedBy: [blockingTask.id],
        });
        const dependent3 = await ledger.createTask({
          subject: "Dependent 3",
          description: "Third dependent",
          blockedBy: [blockingTask.id],
        });

        // Complete the blocking task
        const tool = createTaskCompleteTool(ctx, sessionCtx);
        await tool.handler({
          team_name: "test-team",
          task_id: blockingTask.id,
        });

        // All dependent tasks should be unblocked - verify with fresh ledger
        const verifyLedger = new TeamLedger(join(tempDir, "test-team", "ledger.db"));
        expect(await verifyLedger.isTaskBlocked(dependent1.id)).toBe(false);
        expect(await verifyLedger.isTaskBlocked(dependent2.id)).toBe(false);
        expect(await verifyLedger.isTaskBlocked(dependent3.id)).toBe(false);
        verifyLedger.close();
      });
    });
  });

  describe("Given a task with multiple blockers", () => {
    describe("When completing one blocking task", () => {
      it("Then dependent task should still be blocked if other blockers remain", async () => {
        // Create multiple blocking tasks
        const blocker1 = await ledger.createTask({
          subject: "First Blocker",
          description: "First blocker",
        });
        await ledger.updateTaskStatus(blocker1.id, "in_progress", sessionCtx.sessionKey);

        const blocker2 = await ledger.createTask({
          subject: "Second Blocker",
          description: "Second blocker",
        });
        await ledger.updateTaskStatus(blocker2.id, "in_progress", "session-other-agent");

        // Create a task blocked by both
        const dependentTask = await ledger.createTask({
          subject: "Multi-Blocked Task",
          description: "Blocked by multiple tasks",
          blockedBy: [blocker1.id, blocker2.id],
        });

        // Complete only the first blocker
        const tool = createTaskCompleteTool(ctx, sessionCtx);
        await tool.handler({
          team_name: "test-team",
          task_id: blocker1.id,
        });

        // Dependent task should still be blocked by blocker2 - verify with fresh ledger
        const verifyLedger = new TeamLedger(join(tempDir, "test-team", "ledger.db"));
        const isBlocked = await verifyLedger.isTaskBlocked(dependentTask.id);
        verifyLedger.close();
        expect(isBlocked).toBe(true);
      });
    });
  });

  describe("Given an already completed task", () => {
    describe("When attempting to complete the task again", () => {
      it("Then should return TASK_ALREADY_COMPLETED error", async () => {
        // Create and complete a task
        const task = await ledger.createTask({
          subject: "Already Completed",
          description: "This task is already done",
        });
        await ledger.updateTaskStatus(task.id, "in_progress", sessionCtx.sessionKey);
        await ledger.updateTaskStatus(task.id, "completed");

        const tool = createTaskCompleteTool(ctx, sessionCtx);
        const result = (await tool.handler({
          team_name: "test-team",
          task_id: task.id,
        })) as ToolError;

        expect(result).toHaveProperty("error");
        expect(result.error.code).toBe("TASK_ALREADY_COMPLETED");
      });
    });
  });

  describe("Given a pending (unclaimed) task", () => {
    describe("When attempting to complete the task", () => {
      it("Then should return TASK_NOT_CLAIMED error", async () => {
        // Create a task but don't claim it
        const task = await ledger.createTask({
          subject: "Unclaimed Task",
          description: "This task has not been claimed",
        });

        const tool = createTaskCompleteTool(ctx, sessionCtx);
        const result = (await tool.handler({
          team_name: "test-team",
          task_id: task.id,
        })) as ToolError;

        expect(result).toHaveProperty("error");
        expect(result.error.code).toBe("TASK_NOT_CLAIMED");
      });
    });
  });

  describe("Given a non-existent task", () => {
    describe("When attempting to complete the task", () => {
      it("Then should return TASK_NOT_FOUND error", async () => {
        const tool = createTaskCompleteTool(ctx, sessionCtx);
        const result = (await tool.handler({
          team_name: "test-team",
          task_id: "non-existent-task-id",
        })) as ToolError;

        expect(result).toHaveProperty("error");
        expect(result.error.code).toBe("TASK_NOT_FOUND");
      });
    });
  });

  describe("Given a non-existent team", () => {
    describe("When attempting to complete a task", () => {
      it("Then should return TEAM_NOT_FOUND error", async () => {
        const tool = createTaskCompleteTool(ctx, sessionCtx);
        const result = (await tool.handler({
          team_name: "non-existent-team",
          task_id: "some-task-id",
        })) as ToolError;

        expect(result).toHaveProperty("error");
        expect(result.error.code).toBe("TEAM_NOT_FOUND");
      });
    });
  });

  describe("Tool schema", () => {
    it("should have correct tool name", () => {
      const tool = createTaskCompleteTool(ctx, sessionCtx);
      expect(tool.name).toBe("task_complete");
    });

    it("should have description", () => {
      const tool = createTaskCompleteTool(ctx, sessionCtx);
      expect(tool.description).toBeDefined();
      expect(tool.description.length).toBeGreaterThan(0);
    });

    it("should have schema defined", () => {
      const tool = createTaskCompleteTool(ctx, sessionCtx);
      expect(tool.schema).toBeDefined();
    });
  });
});
