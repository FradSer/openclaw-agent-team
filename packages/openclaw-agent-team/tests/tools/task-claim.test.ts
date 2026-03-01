import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { createTaskClaimTool } from "../../src/tools/task-claim.js";
import { TeamLedger } from "../../src/ledger.js";
import { createTeamDirectory } from "../../src/storage.js";
import type { Task } from "../../src/types.js";

// Type definitions based on the expected API
interface TaskClaimResponse {
  taskId: string;
  status: "in_progress";
  owner: string;
  claimedAt: number;
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

describe("task_claim tool", () => {
  let tempDir: string;
  let ctx: PluginContext;
  let ledger: TeamLedger;
  let sessionCtx: SessionContext;

  beforeEach(async () => {
    tempDir = join(process.cwd(), "test-temp", `task-claim-test-${Date.now()}`);
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

  describe("Given an available task", () => {
    describe("When claiming the task", () => {
      it("Then should update status to 'in_progress'", async () => {
        // Create a pending task
        const task = await ledger.createTask({
          subject: "Available Task",
          description: "This task is available for claiming",
        });

        const tool = createTaskClaimTool(ctx, sessionCtx);
        const result = (await tool.handler({
          team_name: "test-team",
          task_id: task.id,
        })) as TaskClaimResponse;

        expect(result.status).toBe("in_progress");

        // Verify with fresh ledger instance
        const verifyLedger = new TeamLedger(join(tempDir, "test-team", "ledger.db"));
        const updatedTask = await verifyLedger.getTask(task.id);
        verifyLedger.close();
        expect(updatedTask?.status).toBe("in_progress");
      });

      it("Then should set owner to session key", async () => {
        const task = await ledger.createTask({
          subject: "Task for Owner",
          description: "This task will have an owner",
        });

        const tool = createTaskClaimTool(ctx, sessionCtx);
        const result = (await tool.handler({
          team_name: "test-team",
          task_id: task.id,
        })) as TaskClaimResponse;

        expect(result.owner).toBe(sessionCtx.sessionKey);

        // Verify with fresh ledger instance
        const verifyLedger = new TeamLedger(join(tempDir, "test-team", "ledger.db"));
        const updatedTask = await verifyLedger.getTask(task.id);
        verifyLedger.close();
        expect(updatedTask?.owner).toBe(sessionCtx.sessionKey);
      });

      it("Then should set claimedAt timestamp", async () => {
        const task = await ledger.createTask({
          subject: "Task for Timestamp",
          description: "This task will have a claimedAt",
        });

        const beforeClaim = Date.now();
        const tool = createTaskClaimTool(ctx, sessionCtx);
        const result = (await tool.handler({
          team_name: "test-team",
          task_id: task.id,
        })) as TaskClaimResponse;
        const afterClaim = Date.now();

        expect(result.claimedAt).toBeDefined();
        expect(result.claimedAt).toBeGreaterThanOrEqual(beforeClaim);
        expect(result.claimedAt).toBeLessThanOrEqual(afterClaim);

        // Verify with fresh ledger instance
        const verifyLedger = new TeamLedger(join(tempDir, "test-team", "ledger.db"));
        const updatedTask = await verifyLedger.getTask(task.id);
        verifyLedger.close();
        expect(updatedTask?.claimedAt).toBeDefined();
        expect(updatedTask?.claimedAt).toBeGreaterThanOrEqual(beforeClaim);
      });

      it("Then should return taskId in response", async () => {
        const task = await ledger.createTask({
          subject: "Task for ID",
          description: "This task will return its ID",
        });

        const tool = createTaskClaimTool(ctx, sessionCtx);
        const result = (await tool.handler({
          team_name: "test-team",
          task_id: task.id,
        })) as TaskClaimResponse;

        expect(result.taskId).toBe(task.id);
      });
    });
  });

  describe("Given a task already claimed by another agent", () => {
    describe("When attempting to claim the task", () => {
      it("Then should return TASK_ALREADY_CLAIMED error", async () => {
        // Create and claim a task with a different session
        const task = await ledger.createTask({
          subject: "Already Claimed Task",
          description: "This task is already claimed",
        });
        await ledger.updateTaskStatus(task.id, "in_progress", "session-other-agent");

        const tool = createTaskClaimTool(ctx, sessionCtx);
        const result = (await tool.handler({
          team_name: "test-team",
          task_id: task.id,
        })) as ToolError;

        expect(result).toHaveProperty("error");
        expect(result.error.code).toBe("TASK_ALREADY_CLAIMED");
      });

      it("Then should include current owner in error message", async () => {
        const task = await ledger.createTask({
          subject: "Claimed Task with Owner",
          description: "This task has an owner",
        });
        await ledger.updateTaskStatus(task.id, "in_progress", "session-other-agent");

        const tool = createTaskClaimTool(ctx, sessionCtx);
        const result = (await tool.handler({
          team_name: "test-team",
          task_id: task.id,
        })) as ToolError;

        expect(result.error.message).toContain("session-other-agent");
      });
    });
  });

  describe("Given a blocked task", () => {
    describe("When attempting to claim the task", () => {
      it("Then should return TASK_IS_BLOCKED error", async () => {
        // Create a blocking task
        const blockingTask = await ledger.createTask({
          subject: "Blocking Task",
          description: "This task blocks another",
        });

        // Create a blocked task
        const blockedTask = await ledger.createTask({
          subject: "Blocked Task",
          description: "This task is blocked",
          blockedBy: [blockingTask.id],
        });

        const tool = createTaskClaimTool(ctx, sessionCtx);
        const result = (await tool.handler({
          team_name: "test-team",
          task_id: blockedTask.id,
        })) as ToolError;

        expect(result).toHaveProperty("error");
        expect(result.error.code).toBe("TASK_IS_BLOCKED");
      });

      it("Then should list blocking tasks in error", async () => {
        const blockingTask = await ledger.createTask({
          subject: "Blocking Task for Error",
          description: "This blocks another",
        });

        const blockedTask = await ledger.createTask({
          subject: "Blocked Task for Error",
          description: "This is blocked",
          blockedBy: [blockingTask.id],
        });

        const tool = createTaskClaimTool(ctx, sessionCtx);
        const result = (await tool.handler({
          team_name: "test-team",
          task_id: blockedTask.id,
        })) as ToolError;

        // Error should include the blocking task ID or subject
        expect(result.error.message).toContain(blockingTask.id);
      });

      it("Then should list all blocking tasks when multiple exist", async () => {
        const blockingTask1 = await ledger.createTask({
          subject: "First Blocker",
          description: "First blocking task",
        });
        const blockingTask2 = await ledger.createTask({
          subject: "Second Blocker",
          description: "Second blocking task",
        });

        const blockedTask = await ledger.createTask({
          subject: "Multi-Blocked Task",
          description: "Blocked by multiple tasks",
          blockedBy: [blockingTask1.id, blockingTask2.id],
        });

        const tool = createTaskClaimTool(ctx, sessionCtx);
        const result = (await tool.handler({
          team_name: "test-team",
          task_id: blockedTask.id,
        })) as ToolError;

        // Error should include all blocking tasks
        expect(result.error.message).toContain(blockingTask1.id);
        expect(result.error.message).toContain(blockingTask2.id);
      });
    });
  });

  describe("Given a completed task", () => {
    describe("When attempting to claim the task", () => {
      it("Then should return TASK_ALREADY_COMPLETED error", async () => {
        const task = await ledger.createTask({
          subject: "Completed Task",
          description: "This task is done",
        });
        await ledger.updateTaskStatus(task.id, "in_progress", "session-agent");
        await ledger.updateTaskStatus(task.id, "completed");

        const tool = createTaskClaimTool(ctx, sessionCtx);
        const result = (await tool.handler({
          team_name: "test-team",
          task_id: task.id,
        })) as ToolError;

        expect(result).toHaveProperty("error");
        expect(result.error.code).toBe("TASK_ALREADY_COMPLETED");
      });
    });
  });

  describe("Given a non-existent task", () => {
    describe("When attempting to claim the task", () => {
      it("Then should return TASK_NOT_FOUND error", async () => {
        const tool = createTaskClaimTool(ctx, sessionCtx);
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
    describe("When attempting to claim a task", () => {
      it("Then should return TEAM_NOT_FOUND error", async () => {
        const tool = createTaskClaimTool(ctx, sessionCtx);
        const result = (await tool.handler({
          team_name: "non-existent-team",
          task_id: "some-task-id",
        })) as ToolError;

        expect(result).toHaveProperty("error");
        expect(result.error.code).toBe("TEAM_NOT_FOUND");
      });
    });
  });

  describe("Given a task that was previously blocked but is now unblocked", () => {
    describe("When claiming the unblocked task", () => {
      it("Then should successfully claim the task", async () => {
        // Create a blocking task and complete it
        const blockingTask = await ledger.createTask({
          subject: "Completed Blocker",
          description: "This was blocking but is now done",
        });
        await ledger.updateTaskStatus(blockingTask.id, "completed");

        // Create a task that was blocked but is now unblocked
        const unblockedTask = await ledger.createTask({
          subject: "Unblocked Task",
          description: "This was blocked but can now be claimed",
          blockedBy: [blockingTask.id],
        });

        // Verify it's no longer blocked
        expect(await ledger.isTaskBlocked(unblockedTask.id)).toBe(false);

        const tool = createTaskClaimTool(ctx, sessionCtx);
        const result = (await tool.handler({
          team_name: "test-team",
          task_id: unblockedTask.id,
        })) as TaskClaimResponse;

        expect(result.status).toBe("in_progress");
        expect(result.owner).toBe(sessionCtx.sessionKey);
      });
    });
  });

  describe("Tool schema", () => {
    it("should have correct tool name", () => {
      const tool = createTaskClaimTool(ctx, sessionCtx);
      expect(tool.name).toBe("task_claim");
    });

    it("should have description", () => {
      const tool = createTaskClaimTool(ctx, sessionCtx);
      expect(tool.description).toBeDefined();
      expect(tool.description.length).toBeGreaterThan(0);
    });

    it("should have schema defined", () => {
      const tool = createTaskClaimTool(ctx, sessionCtx);
      expect(tool.schema).toBeDefined();
    });
  });
});
