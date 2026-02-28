# Best Practices

## Security

### Input Validation

All user inputs must be validated before use:

```typescript
// Team name validation
const TEAM_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,50}$/;

function validateTeamName(name: string): boolean {
  if (!name || name.length > 50) return false;
  return TEAM_NAME_PATTERN.test(name);
}

// Teammate name validation (more restrictive)
const TEAMMATE_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/;

function sanitizeTeammateName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .slice(0, 100);
}
```

### Path Traversal Prevention

```typescript
function resolveTeamPath(teamsDir: string, teamName: string, ...segments: string[]): string {
  // Validate team name doesn't contain path separators
  if (teamName.includes("/") || teamName.includes("\\")) {
    throw new Error("Invalid team name");
  }

  const basePath = path.join(teamsDir, teamName, ...segments);
  const resolved = path.resolve(basePath);

  // Ensure resolved path is within teams directory
  if (!resolved.startsWith(path.resolve(teamsDir))) {
    throw new Error("Path traversal detected");
  }

  return resolved;
}
```

### File Permissions

```typescript
// Set restrictive permissions on sensitive files
await fs.promises.writeFile(configPath, JSON.stringify(config), {
  mode: 0o600, // Owner read/write only
});

// Directory permissions
await fs.promises.mkdir(dirPath, {
  mode: 0o700, // Owner only
  recursive: true,
});
```

### Message Size Limits

```typescript
const MAX_MESSAGE_SIZE = 100 * 1024; // 100KB

async function sendMessage(content: string): Promise<void> {
  if (Buffer.byteLength(content, "utf8") > MAX_MESSAGE_SIZE) {
    throw new Error(`Message exceeds maximum size of ${MAX_MESSAGE_SIZE} bytes`);
  }
  // ... send logic
}
```

## Performance

### SQLite Best Practices

```typescript
// Use WAL mode for better concurrency
db.pragma("journal_mode = WAL");

// Use transactions for batch operations
function batchCreateTasks(tasks: Task[]): void {
  const stmt = db.prepare(`
    INSERT INTO tasks (id, subject, description, status, created_at)
    VALUES (?, ?, ?, 'pending', ?)
  `);

  const insertMany = db.transaction((tasks: Task[]) => {
    for (const task of tasks) {
      stmt.run(task.id, task.subject, task.description, Date.now());
    }
  });

  insertMany(tasks);
}

// Use prepared statements
const getTaskStmt = db.prepare("SELECT * FROM tasks WHERE id = ?");
function getTask(id: string): Task | null {
  return getTaskStmt.get(id) as Task | null;
}

// Create indexes for common queries
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
  CREATE INDEX IF NOT EXISTS idx_tasks_owner ON tasks(owner);
`);
```

### JSONL Best Practices

```typescript
// Append-only writes (no locking needed)
async function appendMessage(path: string, message: TeamMessage): Promise<void> {
  const line = JSON.stringify(message) + "\n";
  await fs.promises.appendFile(path, line, { mode: 0o600 });
}

// Stream reading for large files
async function* readMessagesStream(path: string): AsyncGenerator<TeamMessage> {
  const file = await fs.promises.open(path, "r");
  const buffer = Buffer.alloc(8192);
  let leftover = "";

  try {
    while (true) {
      const { bytesRead } = await file.read(buffer, 0, buffer.length);
      if (bytesRead === 0) break;

      const content = leftover + buffer.toString("utf8", 0, bytesRead);
      const lines = content.split("\n");
      leftover = lines.pop() ?? "";

      for (const line of lines) {
        if (line.trim()) {
          yield JSON.parse(line);
        }
      }
    }
  } finally {
    await file.close();
  }
}

// File rotation
async function rotateInbox(path: string, maxSizeBytes: number): Promise<void> {
  const stat = await fs.promises.stat(path).catch(() => null);
  if (stat && stat.size > maxSizeBytes) {
    const backup = `${path}.${Date.now()}.bak`;
    await fs.promises.rename(path, backup);
    // Optionally: delete old backups
  }
}
```

### Memory Management

```typescript
// TeamManager pooling
const managerPool = new Map<string, TeamManager>();

function getTeamManager(teamName: string, teamsDir: string): TeamManager {
  const key = `${teamsDir}:${teamName}`;
  let manager = managerPool.get(key);

  if (!manager) {
    manager = new TeamManager(teamName, teamsDir);
    managerPool.set(key, manager);
  }

  return manager;
}

// Cleanup on plugin shutdown
function cleanupManagers(): void {
  for (const manager of managerPool.values()) {
    manager.close();
  }
  managerPool.clear();
}
```

## Error Handling

### Structured Errors

```typescript
class TeamError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "TeamError";
  }
}

// Specific error types
class TeamNotFoundError extends TeamError {
  constructor(teamName: string) {
    super(`Team '${teamName}' not found`, "TEAM_NOT_FOUND", { teamName });
  }
}

class TeammateLimitError extends TeamError {
  constructor(teamName: string, current: number, max: number) {
    super(
      `Team '${teamName}' has reached maximum teammates`,
      "TEAM_FULL",
      { teamName, current, max }
    );
  }
}

class TaskBlockedError extends TeamError {
  constructor(taskId: string, blockingTasks: string[]) {
    super(
      `Task '${taskId}' is blocked`,
      "TASK_BLOCKED",
      { taskId, blockingTasks }
    );
  }
}
```

### Tool Error Responses

```typescript
function jsonResult(data: unknown): string {
  return JSON.stringify(data);
}

function errorResult(error: unknown): string {
  if (error instanceof TeamError) {
    return jsonResult({
      error: error.message,
      code: error.code,
      details: error.details,
    });
  }

  return jsonResult({
    error: error instanceof Error ? error.message : String(error),
    code: "UNKNOWN",
  });
}
```

### Retry Logic

```typescript
interface RetryOptions {
  maxAttempts: number;
  delayMs: number;
  backoff: number;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  let lastError: Error | undefined;
  let delay = options.delayMs;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < options.maxAttempts) {
        await sleep(delay);
        delay *= options.backoff;
      }
    }
  }

  throw lastError;
}
```

## Testing

### Unit Test Patterns

```typescript
// tests/ledger.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TeamLedger } from "../src/ledger.js";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

describe("TeamLedger", () => {
  let tempDir: string;
  let ledger: TeamLedger;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "team-ledger-"));
    ledger = new TeamLedger(join(tempDir, "test.db"));
  });

  afterEach(async () => {
    ledger.close();
    await rm(tempDir, { recursive: true });
  });

  describe("createTask", () => {
    it("should create task with generated ID", () => {
      const task = ledger.createTask({
        subject: "Test task",
        description: "Description",
      });

      expect(task.id).toMatch(/^[a-f0-9-]{36}$/);
      expect(task.status).toBe("pending");
    });

    it("should create task with dependencies", () => {
      const task1 = ledger.createTask({ subject: "Task 1", description: "" });
      const task2 = ledger.createTask({
        subject: "Task 2",
        description: "",
        blockedBy: [task1.id],
      });

      expect(ledger.isTaskBlocked(task2.id)).toBe(true);
    });
  });
});
```

### Integration Test Patterns

```typescript
// tests/integration/team-workflow.test.ts
describe("Team Workflow", () => {
  it("should complete full workflow", async () => {
    // Setup
    const ctx = await createTestContext();

    // Create team
    const createResult = await executeTool(ctx, "team_create", {
      team_name: "test-team",
    });
    expect(createResult.teamId).toBeDefined();

    // Spawn teammate
    const spawnResult = await executeTool(ctx, "teammate_spawn", {
      team_name: "test-team",
      name: "worker",
    });
    expect(spawnResult.agentId).toMatch(/^teammate-test-team-worker$/);

    // Create and complete task
    const taskResult = await executeTool(ctx, "task_create", {
      team_name: "test-team",
      subject: "Test task",
    });

    await executeTool(ctx, "task_claim", { task_id: taskResult.taskId });
    await executeTool(ctx, "task_complete", { task_id: taskResult.taskId });

    // Verify
    const tasks = await executeTool(ctx, "task_list", { team_name: "test-team" });
    expect(tasks.find((t: Task) => t.id === taskResult.taskId)?.status).toBe("completed");

    // Cleanup
    await executeTool(ctx, "team_shutdown", { team_name: "test-team" });
  });
});
```

### Mock Patterns

```typescript
// tests/mocks/runtime.ts
export function createMockRuntime(): PluginRuntime {
  return {
    version: "test",
    config: {
      loadConfig: vi.fn().mockResolvedValue({}),
      writeConfigFile: vi.fn().mockResolvedValue(undefined),
    },
    system: {
      enqueueSystemEvent: vi.fn(),
      runCommandWithTimeout: vi.fn(),
      formatNativeDependencyHint: vi.fn(),
    },
    state: {
      resolveStateDir: vi.fn().mockReturnValue("/tmp/test-teams"),
    },
    // ... other mock methods
  };
}
```

## Code Quality

### Naming Conventions

- **Files**: `kebab-case.ts`
- **Classes**: `PascalCase`
- **Functions**: `camelCase`
- **Constants**: `SCREAMING_SNAKE_CASE`
- **Types/Interfaces**: `PascalCase`

### File Organization

```typescript
// 1. Imports (grouped)
import { Type } from "@sinclair/typebox";        // External
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { jsonResult, readStringParam } from "../common.js";  // Internal
import { getTeamManager } from "../pool.js";

// 2. Constants
const MAX_TEAM_NAME_LENGTH = 50;

// 3. Types (if file-specific)
interface ToolContext { ... }

// 4. Schema
const TeamCreateSchema = Type.Object({ ... });

// 5. Main exports
export function createTeamCreateTool(ctx: ToolContext): AnyAgentTool { ... }

// 6. Helper functions (not exported)
function validateParams(params: unknown): void { ... }
```

### Documentation

```typescript
/**
 * Creates a new teammate agent with isolated workspace.
 *
 * @param params - Spawn parameters
 * @param params.teamName - The team to add the teammate to
 * @param params.name - The teammate's name (will be sanitized)
 * @param params.agentType - The type of agent (e.g., "Explore", "general-purpose")
 * @param params.model - Optional model override
 * @returns The agent ID and session key
 * @throws {TeamNotFoundError} If the team doesn't exist
 * @throws {TeammateLimitError} If the team is at capacity
 *
 * @example
 * ```typescript
 * const result = await spawnTeammateAgent({
 *   runtime,
 *   cfg,
 *   teamName: "my-team",
 *   name: "researcher",
 *   agentType: "Explore",
 * });
 * // result.agentId: "teammate-my-team-researcher"
 * ```
 */
export async function spawnTeammateAgent(params: SpawnParams): Promise<SpawnResult> {
  // ...
}
```

## Configuration

### Plugin Configuration Schema

```json
{
  "id": "agent-team",
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "maxTeammatesPerTeam": {
        "type": "integer",
        "minimum": 1,
        "maximum": 50,
        "default": 10
      },
      "defaultAgentType": {
        "type": "string",
        "default": "general-purpose"
      },
      "taskRetentionDays": {
        "type": "integer",
        "minimum": 1,
        "default": 30
      },
      "heartbeatIntervalMs": {
        "type": "integer",
        "minimum": 10000,
        "default": 30000
      },
      "inboxRotationBytes": {
        "type": "integer",
        "minimum": 1048576,
        "default": 10485760
      }
    }
  },
  "uiHints": {
    "maxTeammatesPerTeam": {
      "label": "Max Teammates per Team",
      "help": "Maximum number of agents in a single team"
    },
    "defaultAgentType": {
      "label": "Default Agent Type",
      "placeholder": "general-purpose"
    }
  }
}
```

### Default Values

```typescript
const DEFAULT_CONFIG = {
  maxTeammatesPerTeam: 10,
  defaultAgentType: "general-purpose",
  taskRetentionDays: 30,
  heartbeatIntervalMs: 30000,
  inboxRotationBytes: 10 * 1024 * 1024, // 10MB
} as const;
```