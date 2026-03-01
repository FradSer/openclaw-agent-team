import { Type, type Static } from "@sinclair/typebox";
import { join } from "node:path";
import { teamDirectoryExists } from "../storage.js";
import { TeamLedger } from "../ledger.js";
import type { Task } from "../types.js";

// Schema for task claim parameters
export const TaskClaimSchema = Type.Object({
  team_name: Type.String({ minLength: 1, maxLength: 50 }),
  task_id: Type.String({ minLength: 1 }),
});

export type TaskClaimParams = Static<typeof TaskClaimSchema>;

// Response types
export interface TaskClaimResponse {
  taskId: string;
  status: "in_progress";
  owner: string;
  claimedAt: number;
}

export interface ToolError {
  error: {
    code: string;
    message: string;
  };
}

// Plugin context type
export interface PluginContext {
  teamsDir: string;
  api?: unknown;
}

// Session context type for getting the current teammate
export interface SessionContext {
  sessionKey: string;
  teammateName: string;
  teamName: string;
}

// Tool type for testing compatibility
export interface TaskClaimTool {
  label: string;
  name: string;
  description: string;
  schema: typeof TaskClaimSchema;
  handler: (params: TaskClaimParams) => Promise<TaskClaimResponse | ToolError>;
}

/**
 * Creates a task_claim tool that allows agents to claim available tasks.
 */
export function createTaskClaimTool(
  ctx: PluginContext,
  sessionCtx: SessionContext
): TaskClaimTool {
  return {
    label: "Task Claim",
    name: "task_claim",
    description: "Claims an available task for the current agent session",
    schema: TaskClaimSchema,
    handler: async (params: TaskClaimParams): Promise<TaskClaimResponse | ToolError> => {
      const { team_name, task_id } = params;

      // Check if team exists
      const teamExists = await teamDirectoryExists(ctx.teamsDir, team_name);
      if (!teamExists) {
        return {
          error: {
            code: "TEAM_NOT_FOUND",
            message: `Team "${team_name}" not found`,
          },
        };
      }

      // Open the ledger for this team
      const dbPath = join(ctx.teamsDir, team_name, "ledger.db");
      const ledger = new TeamLedger(dbPath);

      try {
        // Get the task
        const task = await ledger.getTask(task_id);
        if (!task) {
          return {
            error: {
              code: "TASK_NOT_FOUND",
              message: `Task "${task_id}" not found in team "${team_name}"`,
            },
          };
        }

        // Check if task is already completed
        if (task.status === "completed") {
          return {
            error: {
              code: "TASK_ALREADY_COMPLETED",
              message: `Task "${task_id}" is already completed`,
            },
          };
        }

        // Check if task is already claimed (in_progress with an owner)
        if (task.status === "in_progress" && task.owner) {
          return {
            error: {
              code: "TASK_ALREADY_CLAIMED",
              message: `Task "${task_id}" is already claimed by "${task.owner}"`,
            },
          };
        }

        // Check if task is blocked
        if (await ledger.isTaskBlocked(task_id)) {
          const blockingTasks = await ledger.getBlockingTasks(task_id);
          const incompleteBlockers = blockingTasks.filter(
            (t: Task) => t.status !== "completed"
          );
          const blockerIds = incompleteBlockers.map((t: Task) => t.id).join(", ");

          return {
            error: {
              code: "TASK_IS_BLOCKED",
              message: `Task "${task_id}" is blocked by incomplete tasks: ${blockerIds}`,
            },
          };
        }

        // Claim the task
        const owner = sessionCtx.sessionKey;
        const success = await ledger.updateTaskStatus(task_id, "in_progress", owner);

        if (!success) {
          return {
            error: {
              code: "TASK_NOT_FOUND",
              message: `Failed to update task "${task_id}"`,
            },
          };
        }

        // Get the updated task to return the claimedAt timestamp
        const updatedTask = await ledger.getTask(task_id);

        return {
          taskId: task_id,
          status: "in_progress",
          owner,
          claimedAt: updatedTask?.claimedAt ?? Date.now(),
        };
      } finally {
        ledger.close();
      }
    },
  };
}
