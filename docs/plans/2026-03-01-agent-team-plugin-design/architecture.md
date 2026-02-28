# Architecture

## System Overview

```mermaid
graph TB
    subgraph Plugin["@fradser/openclaw-agent-team Plugin"]
        Entry[index.ts]
        Tools[Tools Layer]
        Core[Core Modules]
        Storage[Storage Layer]
    end

    subgraph OpenClaw["OpenClaw Core"]
        Runtime[PluginRuntime]
        Config[ConfigManager]
        Gateway[Gateway]
        Sessions[SessionManager]
    end

    subgraph FileSystem["File System"]
        TeamsDir["~/.openclaw/teams/"]
        ConfigFile["config.json"]
        LedgerDB["ledger.db"]
        Inbox["inbox/*.jsonl"]
    end

    Entry --> Tools
    Tools --> Core
    Core --> Storage
    Storage --> FileSystem

    Core --> Runtime
    Runtime --> Config
    Runtime --> Gateway
    Runtime --> Sessions

    Tools -->|"registerTool()"| Runtime
    Core -->|"writeConfigFile()"| Config
```

## Component Details

### 1. Plugin Entry Point (index.ts)

**Responsibility**: Register tools, services, and hooks with OpenClaw.

```typescript
// index.ts
const agentTeamPlugin = {
  id: "agent-team",
  name: "Agent Team",
  description: "Multi-agent team coordination with shared task ledger",
  configSchema: AgentTeamConfigSchema,

  async register(api: OpenClawPluginApi) {
    const ctx = createPluginContext(api);

    // Register agent tools
    registerTeamTools(api, ctx);

    // Register background service for cleanup
    api.registerService(createCleanupService(ctx));

    // Register hooks for context injection
    api.on("before_prompt_build", injectTeamContext(ctx));

    api.logger.info("[agent-team] Plugin registered");
  },
};

export default agentTeamPlugin;
```

### 2. Types (src/types.ts)

```typescript
// Core type definitions
export interface TeamConfig {
  id: string;
  team_name: string;
  description?: string;
  agent_type: string;
  lead: string;
  metadata: {
    createdAt: number;
    updatedAt: number;
    status: "active" | "shutdown";
  };
}

export interface TeammateDefinition {
  name: string;
  agentId: string;
  sessionKey: string;
  agentType: string;
  model?: string;
  tools?: {
    allow?: string[];
    deny?: string[];
  };
  status: "idle" | "working" | "error" | "shutdown";
  joinedAt: number;
}

export interface Task {
  id: string;
  subject: string;
  description: string;
  activeForm?: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "blocked";
  owner?: string;
  blockedBy: string[];
  createdAt: number;
  claimedAt?: number;
  completedAt?: number;
}

export interface TeamMessage {
  id: string;
  from: string;
  to?: string;
  type: "message" | "broadcast" | "task_update" | "shutdown_request";
  content: string;
  summary?: string;
  timestamp: number;
}
```

### 3. Storage Layer (src/storage.ts)

**Responsibility**: Manage team directories, config files, and path resolution.

```typescript
// Key functions
export function getTeamsBaseDir(): string;
export async function createTeamDirectory(teamsDir: string, teamName: string): Promise<void>;
export async function teamDirectoryExists(teamsDir: string, teamName: string): Promise<boolean>;
export function validateTeamName(name: string): boolean;
export async function writeTeamConfig(teamsDir: string, teamName: string, config: TeamConfig): Promise<void>;
export async function readTeamConfig(teamsDir: string, teamName: string): Promise<TeamConfig | null>;

// Teammate path resolution
export function resolveTeammatePaths(teamsDir: string, teamName: string, teammateName: string): {
  workspace: string;
  agentDir: string;
  inboxPath: string;
};
```

### 4. SQLite Ledger (src/ledger.ts)

**Responsibility**: Persist tasks, members, and team state with ACID guarantees.

```typescript
export class TeamLedger {
  private db: Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.initializeTables();
  }

  // Task operations
  createTask(task: Omit<Task, "id" | "createdAt">): Task;
  getTask(taskId: string): Task | null;
  listTasks(filter?: TaskFilter): Task[];
  updateTaskStatus(taskId: string, status: TaskStatus, owner?: string): boolean;
  deleteTask(taskId: string): boolean;

  // Member operations
  addMember(member: TeammateDefinition): void;
  listMembers(): TeammateDefinition[];
  updateMemberStatus(sessionKey: string, status: string): boolean;
  removeMember(sessionKey: string): boolean;

  // Dependency operations
  getBlockingTasks(taskId: string): Task[];
  getDependentTasks(taskId: string): Task[];
  isTaskBlocked(taskId: string): boolean;

  // Close
  close(): void;
}
```

**Database Schema**:

```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  description TEXT,
  active_form TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  owner TEXT,
  created_at INTEGER NOT NULL,
  claimed_at INTEGER,
  completed_at INTEGER
);

CREATE TABLE task_dependencies (
  task_id TEXT NOT NULL,
  blocks_task_id TEXT NOT NULL,
  PRIMARY KEY (task_id, blocks_task_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (blocks_task_id) REFERENCES tasks(id)
);

CREATE TABLE members (
  session_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  agent_type TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  joined_at INTEGER NOT NULL
);

CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_owner ON tasks(owner);
CREATE INDEX idx_members_status ON members(status);
```

### 5. Mailbox System (src/mailbox.ts)

**Responsibility**: Route messages between agents via JSONL files.

```typescript
export class Mailbox {
  constructor(private teamsDir: string, private teamName: string) {}

  // Send message to specific recipient
  async sendDirectMessage(params: {
    from: string;
    to: string;
    content: string;
    summary?: string;
  }): Promise<TeamMessage>;

  // Broadcast to all teammates
  async broadcast(params: {
    from: string;
    content: string;
    summary?: string;
  }): Promise<TeamMessage[]>;

  // Read messages for a session
  async readInbox(sessionKey: string, options?: {
    limit?: number;
    clear?: boolean;
  }): Promise<TeamMessage[]>;

  // Internal
  private getInboxPath(sessionKey: string): string;
  private appendMessage(path: string, message: TeamMessage): Promise<void>;
}
```

**JSONL Format**:

```
{"id":"msg-001","from":"lead","to":"researcher","type":"message","content":"Focus on API","summary":"Task","timestamp":1709251200000}
{"id":"msg-002","from":"researcher","to":"lead","type":"task_update","content":"Task complete","summary":"Done","timestamp":1709251500000}
```

### 6. Teammate Spawner (src/teammate-spawner.ts)

**Responsibility**: Create full agent instances using Feishu pattern.

```typescript
export async function spawnTeammateAgent(params: {
  runtime: PluginRuntime;
  cfg: OpenClawConfig;
  teamName: string;
  teammateName: string;
  agentType: string;
  model?: string;
  tools?: { allow?: string[]; deny?: string[] };
}): Promise<{ agentId: string; sessionKey: string }> {
  const { runtime, cfg, teamName, teammateName, agentType, model, tools } = params;

  const teamsDir = getTeamsBaseDir();
  const sanitized = sanitizeTeammateName(teammateName);
  const agentId = `teammate-${teamName}-${sanitized}`;
  const sessionKey = `agent:${agentId}:main`;

  // Resolve paths
  const { workspace, agentDir } = resolveTeammatePaths(teamsDir, teamName, sanitized);

  // Create directories
  await fs.promises.mkdir(workspace, { recursive: true });
  await fs.promises.mkdir(path.join(agentDir, "sessions"), { recursive: true });

  // Build agent config
  const newAgent: AgentConfig = {
    id: agentId,
    workspace,
    agentDir,
    ...(model && { model: { primary: model } }),
    ...(tools && { tools }),
  };

  // Update global config
  const updatedCfg: OpenClawConfig = {
    ...cfg,
    agents: {
      ...cfg.agents,
      list: [...(cfg.agents?.list ?? []), newAgent],
    },
  };

  await runtime.config.writeConfigFile(updatedCfg);

  return { agentId, sessionKey };
}
```

### 7. Tools Layer (src/tools/)

Each tool follows the OpenClaw `AnyAgentTool` interface:

```typescript
// src/tools/teammate-spawn.ts
export function createTeammateSpawnTool(ctx: PluginContext): AnyAgentTool {
  return {
    label: "Teammate Spawn",
    name: "teammate_spawn",
    description: "Creates a new teammate agent with isolated workspace.",
    parameters: TeammateSpawnSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;

      // Validate team exists
      const teamName = readStringParam(params, "team_name", { required: true });
      if (!(await teamDirectoryExists(ctx.teamsDir, teamName))) {
        return jsonResult({ error: `Team '${teamName}' not found` });
      }

      // Check teammate limit
      const manager = getTeamManager(teamName, ctx.teamsDir);
      if (manager.listMembers().length >= ctx.config.maxTeammatesPerTeam) {
        return jsonResult({ error: "Team at maximum capacity" });
      }

      // Spawn agent
      const result = await spawnTeammateAgent({
        runtime: ctx.api.runtime,
        cfg: ctx.api.config,
        teamName,
        teammateName: readStringParam(params, "name", { required: true }),
        agentType: readStringParam(params, "agent_type") ?? ctx.config.defaultAgentType,
        model: readStringParam(params, "model"),
      });

      // Register in ledger
      await manager.addMember({
        name: params.name,
        agentId: result.agentId,
        sessionKey: result.sessionKey,
        agentType: params.agent_type ?? "member",
        status: "idle",
        joinedAt: Date.now(),
      });

      return jsonResult({
        teammateId: result.agentId,
        sessionKey: result.sessionKey,
        status: "spawned",
      });
    },
  };
}
```

## Data Flow

### Team Creation Flow

```mermaid
sequenceDiagram
    participant User
    participant Tool as team_create
    participant Storage
    participant Ledger

    User->>Tool: team_create("my-team")
    Tool->>Storage: validateTeamName("my-team")
    Storage-->>Tool: valid
    Tool->>Storage: teamDirectoryExists("my-team")
    Storage-->>Tool: false
    Tool->>Storage: createTeamDirectory("my-team")
    Storage-->>Tool: created
    Tool->>Ledger: new TeamLedger(path)
    Tool->>Storage: writeTeamConfig(config)
    Tool-->>User: { teamId, teamName, status }
```

### Teammate Spawn Flow

```mermaid
sequenceDiagram
    participant Lead as Team Lead
    participant Tool as teammate_spawn
    participant Spawner
    participant Config as ConfigManager
    participant Ledger

    Lead->>Tool: spawn("researcher")
    Tool->>Ledger: listMembers()
    Ledger-->>Tool: current count
    Tool->>Spawner: spawnTeammateAgent()
    Spawner->>Spawner: create directories
    Spawner->>Config: writeConfigFile(updated)
    Config-->>Spawner: saved
    Spawner-->>Tool: { agentId, sessionKey }
    Tool->>Ledger: addMember()
    Tool-->>Lead: { teammateId, sessionKey }
```

### Message Delivery Flow

OpenClaw uses **Heartbeat Wake + Context Injection** mechanism for inter-agent messaging:

```mermaid
sequenceDiagram
    participant Sender as Team Lead
    participant Mailbox as JSONL Inbox
    participant Heartbeat as Heartbeat Wake
    participant Teammate as Teammate Agent
    participant Context as Context Injection

    Sender->>Mailbox: send_message("researcher", "Focus on API")
    Note over Mailbox: Write to inbox/researcher/messages.jsonl
    Mailbox->>Heartbeat: requestHeartbeatNow(sessionKey)
    Note over Heartbeat: Schedule wake for teammate session
    Heartbeat->>Teammate: Wake session (after coalesce delay)
    Teammate->>Context: before_prompt_build hook fires
    Context->>Mailbox: readInboxMessages()
    Mailbox-->>Context: [message1, message2]
    Context->>Context: Convert to XML format
    Context-->>Teammate: prependContext injected to system prompt
    Note over Teammate: Messages appear in context
    Context->>Mailbox: clearInboxMessages()
```

### 8. Context Injection Hook (src/context-injection.ts)

**Responsibility**: Inject pending messages into teammate's context on heartbeat wake.

```typescript
import type { PluginHookAgentContext, PluginHookBeforePromptBuildResult } from "openclaw/plugin-sdk";
import { readInboxMessages, clearInboxMessages } from "./mailbox.js";
import { getTeamsBaseDir } from "./storage.js";

/**
 * Parse team info from agentId
 * agentId format: "teammate-{teamName}-{teammateName}"
 */
function parseTeamFromAgentId(agentId: string): { teamName: string; teammateName: string } | null {
  if (!agentId?.startsWith("teammate-")) return null;

  const parts = agentId.slice("teammate-".length).split("-");
  if (parts.length < 2) return null;

  // teamName may contain hyphens, last part is teammateName
  const teammateName = parts.pop()!;
  const teamName = parts.join("-");

  return { teamName, teammateName };
}

/**
 * Escape special characters for XML
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Convert message to XML format for context injection
 */
function messageToXml(msg: Record<string, unknown>): string {
  const from = (msg.from as string) || "unknown";
  const type = (msg.type as string) || "message";
  const summary = msg.summary ? ` summary="${escapeXml(msg.summary as string)}"` : "";
  const content = (msg.content as string) || "";

  return `<teammate-message from="${from}" type="${type}"${summary}>\n${escapeXml(content)}\n</teammate-message>`;
}

/**
 * before_prompt_build hook handler
 * Injects pending inbox messages into teammate's context
 */
export async function handleBeforePromptBuild(
  event: { prompt: string; messages: unknown[] },
  ctx: PluginHookAgentContext,
): Promise<PluginHookBeforePromptBuildResult> {
  // Only process teammate sessions
  if (!ctx.agentId?.startsWith("teammate-")) {
    return {};
  }

  // Parse team info
  const parsed = parseTeamFromAgentId(ctx.agentId);
  if (!parsed || !ctx.sessionKey) {
    return {};
  }

  const { teamName } = parsed;
  const teamsDir = getTeamsBaseDir();

  // Read pending messages
  const messages = await readInboxMessages(teamName, teamsDir, ctx.sessionKey);

  if (messages.length === 0) {
    return {};
  }

  // Convert to XML format
  const xmlContext = messages.map(messageToXml).join("\n");

  // Clear processed messages
  await clearInboxMessages(teamName, teamsDir, ctx.sessionKey);

  // Return context to prepend
  return {
    prependContext: xmlContext,
  };
}
```

**XML Message Format in Context**:

```xml
<teammate-message from="lead" type="message" summary="Task assignment">
  Focus on the API design first, then move to implementation.
</teammate-message>

<teammate-message from="researcher" type="task_update" summary="Status update">
  API design complete. Ready for review.
</teammate-message>
```

### 9. Heartbeat Wake Integration

The heartbeat system wakes idle teammates when messages arrive:

```typescript
// In send_message tool
async function sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
  // 1. Write message to inbox
  await writeInboxMessage(teamName, teamsDir, recipient, {
    id: generateId(),
    from: senderSessionKey,
    to: recipient,
    type: "message",
    content: params.content,
    summary: params.summary,
    timestamp: Date.now(),
  });

  // 2. Trigger heartbeat wake if recipient is a teammate
  if (recipient.startsWith("agent:teammate-")) {
    // Use OpenClaw's heartbeat wake system
    // This is handled automatically when writing to agent: prefixed sessions
    // The plugin SDK exposes this via runtime heartbeat APIs
  }

  return { messageId, delivered: true };
}
```

**Heartbeat Wake Behavior**:

| Parameter | Value | Description |
|-----------|-------|-------------|
| `coalesceMs` | 250 (default) | Delay to batch multiple messages |
| `reason` | "teammate-message" | Identifier for wake source |
| `sessionKey` | recipient | Target session to wake |

### Plugin Hook Registration

```typescript
// index.ts
const agentTeamPlugin = {
  id: "agent-team",

  async register(api: OpenClawPluginApi) {
    const ctx = createPluginContext(api);

    // Register tools
    registerTeamTools(api, ctx);

    // Register context injection hook
    api.on("before_prompt_build", async (event, ctx) => {
      return handleBeforePromptBuild(event, ctx);
    });

    api.logger.info("[agent-team] Plugin registered");
  },
};
```

### Message Delivery Guarantees

| Guarantee | Mechanism |
|-----------|-----------|
| **Persistence** | JSONL files survive restarts |
| **Ordering** | Messages read in append order |
| **Delivery** | Heartbeat wake ensures teammate sees message |
| **Acknowledgment** | Messages cleared after successful read |
| **At-least-once** | No acknowledgment before clear (could re-deliver on crash) |

## Error Handling

### Error Categories

| Category | Handling Strategy |
|----------|-------------------|
| Validation | Return structured error with field and message |
| Not Found | Return 404-style error with resource type |
| Conflict | Return conflict error with current state |
| System | Log error, return generic message, suggest recovery |

### Error Response Format

```typescript
interface ToolError {
  error: string;
  code: "VALIDATION" | "NOT_FOUND" | "CONFLICT" | "SYSTEM";
  details?: Record<string, unknown>;
  suggestedAction?: string;
}
```

## Performance Considerations

### SQLite Optimization

- WAL mode for concurrent reads
- Prepared statements for repeated queries
- Batch inserts in transactions
- Regular VACUUM and ANALYZE

### JSONL Optimization

- Append-only writes (no file locking)
- Per-sender files to reduce contention
- Rotation at 10MB threshold
- Lazy cleanup during read operations

### Memory Management

- TeamManager pooling (reuse instances)
- Lazy loading of ledger on first access
- Periodic cleanup of stale resources