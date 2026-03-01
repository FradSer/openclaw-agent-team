import { Type, type Static } from "@sinclair/typebox";
import { join } from "node:path";
import { teamDirectoryExists } from "../storage.js";
import { TeamLedger } from "../ledger.js";

// Schema for task complete parameters
export const TaskCompleteSchema = Type.Object({
  team_name: Type.String({ minLength: 1, maxLength: 50 }),
  task_id: Type.String({ minLength: 1 }),
});

export type TaskCompleteParams = Static<typeof TaskCompleteSchema>;

// Response types
export interface TaskCompleteResponse {
  taskId: string;
  status: "completed";
  completedAt: number;
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
export interface TaskCompleteTool {
  label: string;
  name: string;
  description: string;
  schema: typeof TaskCompleteSchema;
  handler: (params: TaskCompleteParams) => Promise<TaskCompleteResponse | ToolError>;
}

/**
 * Creates a task_complete tool that allows agents to mark their claimed tasks as completed.
 */
export function createTaskCompleteTool(
  ctx: PluginContext,
  sessionCtx: SessionContext
): TaskCompleteTool {
  return {
    label: "Task Complete",
    name: "task_complete",
    description: "Marks a claimed task as completed. Only the agent who claimed the task can complete it.",
    schema: TaskCompleteSchema,
    handler: async (params: TaskCompleteParams): Promise<TaskCompleteResponse | ToolError> => {
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

        // Check if task is pending (not claimed yet)
        if (task.status === "pending") {
          return {
            error: {
              code: "TASK_NOT_CLAIMED",
              message: `Task "${task_id}" has not been claimed yet. Claim the task before completing it.`,
            },
          };
        }

        // Check if the current session owns the task
        if (task.owner !== sessionCtx.sessionKey) {
          return {
            error: {
              code: "NOT_TASK_OWNER",
              message: `Task "${task_id}" is owned by "${task.owner}", not by the current session "${sessionCtx.sessionKey}"`,
            },
          };
        }

        // Complete the task
        const success = await ledger.updateTaskStatus(task_id, "completed");

        if (!success) {
          return {
            error: {
              code: "TASK_NOT_FOUND",
              message: `Failed to update task "${task_id}"`,
            },
          };
        }

        // Get the updated task to return the completedAt timestamp
        const updatedTask = await ledger.getTask(task_id);

        return {
          taskId: task_id,
          status: "completed",
          completedAt: updatedTask?.completedAt ?? Date.now(),
        };
      } finally {
        ledger.close();
      }
    },
  };
}
