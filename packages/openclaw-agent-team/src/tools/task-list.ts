import { Type, type Static } from "@sinclair/typebox";
import { join } from "node:path";
import { teamDirectoryExists } from "../storage.js";
import { TeamLedger } from "../ledger.js";
import type { TaskStatus } from "../types.js";

// Schema for task list parameters
export const TaskListSchema = Type.Object({
  team_name: Type.String({ minLength: 1, maxLength: 50 }),
  status: Type.Optional(
    Type.Union([
      Type.Literal("pending"),
      Type.Literal("in_progress"),
      Type.Literal("completed"),
      Type.Literal("failed"),
      Type.Literal("blocked"),
    ])
  ),
  owner: Type.Optional(Type.String()),
  includeCompleted: Type.Optional(Type.Boolean()),
});

export type TaskListParams = Static<typeof TaskListSchema>;

// Response types
export interface TaskListItem {
  id: string;
  subject: string;
  status: string;
  owner?: string;
  blocked: boolean;
  createdAt: number;
  completedAt?: number;
}

export interface TaskListResponse {
  tasks: TaskListItem[];
  count: number;
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
export interface TaskListTool {
  label: string;
  name: string;
  description: string;
  schema: typeof TaskListSchema;
  handler: (params: TaskListParams) => Promise<TaskListResponse | ToolError>;
}

/**
 * Creates a task_list tool that lists tasks for a team with optional filtering.
 */
export function createTaskListTool(ctx: PluginContext): TaskListTool {
  return {
    label: "Task List",
    name: "task_list",
    description: "Lists tasks for a team with optional filtering by status, owner, and completion state",
    schema: TaskListSchema,
    handler: async (params: TaskListParams): Promise<TaskListResponse | ToolError> => {
      const { team_name, status, owner, includeCompleted } = params;

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
        // Build filter object
        const filter: {
          status?: TaskStatus;
          owner?: string;
          includeCompleted?: boolean;
        } = {};

        if (status !== undefined) {
          filter.status = status as TaskStatus;
        }
        if (owner !== undefined) {
          filter.owner = owner;
        }
        if (includeCompleted !== undefined) {
          filter.includeCompleted = includeCompleted;
        }

        // List tasks with filter
        const tasks = await ledger.listTasks(
          Object.keys(filter).length > 0 ? filter : undefined
        );

        // Map tasks to response format with blocked status
        const taskItems: TaskListItem[] = await Promise.all(
          tasks.map(async (task) => ({
            id: task.id,
            subject: task.subject,
            status: task.status,
            owner: task.owner,
            blocked: await ledger.isTaskBlocked(task.id),
            createdAt: task.createdAt,
            completedAt: task.completedAt,
          }))
        );

        return {
          tasks: taskItems,
          count: taskItems.length,
        };
      } finally {
        ledger.close();
      }
    },
  };
}
