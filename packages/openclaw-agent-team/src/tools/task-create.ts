import { Type, type Static } from "@sinclair/typebox";
import { join } from "node:path";
import { TeamLedger } from "../ledger.js";
import { teamDirectoryExists } from "../storage.js";

// Schema for task creation parameters
export const TaskCreateSchema = Type.Object({
  team_name: Type.String({ minLength: 1, maxLength: 50 }),
  subject: Type.String({ minLength: 1 }),
  description: Type.String({ minLength: 1 }),
  activeForm: Type.Optional(Type.String()),
  blockedBy: Type.Optional(Type.Array(Type.String())),
});

export type TaskCreateParams = Static<typeof TaskCreateSchema>;

// Response types
export interface TaskCreateResponse {
  taskId: string;
  subject: string;
  status: string;
  blocked: boolean;
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

// Tool type for testing compatibility
export interface TaskCreateTool {
  label: string;
  name: string;
  description: string;
  schema: typeof TaskCreateSchema;
  handler: (params: TaskCreateParams) => Promise<TaskCreateResponse | ToolError>;
}

/**
 * Creates a task_create tool that creates new tasks within a team.
 */
export function createTaskCreateTool(ctx: PluginContext): TaskCreateTool {
  return {
    label: "Task Create",
    name: "task_create",
    description: "Creates a new task within a team with optional dependencies",
    schema: TaskCreateSchema,
    handler: async (params: TaskCreateParams): Promise<TaskCreateResponse | ToolError> => {
      const { team_name, subject, description, activeForm, blockedBy } = params;

      // Check if team exists
      const exists = await teamDirectoryExists(ctx.teamsDir, team_name);
      if (!exists) {
        return {
          error: {
            code: "TEAM_NOT_FOUND",
            message: `Team "${team_name}" not found`,
          },
        };
      }

      // Validate required fields
      if (!subject || subject.length === 0) {
        return {
          error: {
            code: "MISSING_SUBJECT",
            message: "Subject is required and cannot be empty",
          },
        };
      }

      if (!description || description.length === 0) {
        return {
          error: {
            code: "MISSING_DESCRIPTION",
            message: "Description is required and cannot be empty",
          },
        };
      }

      // Open the team's ledger
      const dbPath = join(ctx.teamsDir, team_name, "ledger.db");
      const ledger = new TeamLedger(dbPath);

      try {
        // Validate blocking tasks exist if provided
        if (blockedBy && blockedBy.length > 0) {
          for (const blockingId of blockedBy) {
            const blockingTask = await ledger.getTask(blockingId);
            if (!blockingTask) {
              return {
                error: {
                  code: "BLOCKING_TASK_NOT_FOUND",
                  message: `Blocking task "${blockingId}" not found`,
                },
              };
            }
          }
        }

        // Create the task
        let task;
        try {
          task = await ledger.createTask({
            subject,
            description,
            ...(activeForm !== undefined && { activeForm }),
            ...(blockedBy !== undefined && { blockedBy }),
          });
        } catch (error) {
          if (error instanceof Error && error.message.includes("Circular dependency")) {
            return {
              error: {
                code: "CIRCULAR_DEPENDENCY",
                message: "Cannot create task with circular dependency",
              },
            };
          }
          throw error;
        }

        // Check if the task is blocked
        const isBlocked = await ledger.isTaskBlocked(task.id);

        return {
          taskId: task.id,
          subject: task.subject,
          status: task.status,
          blocked: isBlocked,
        };
      } finally {
        ledger.close();
      }
    },
  };
}
