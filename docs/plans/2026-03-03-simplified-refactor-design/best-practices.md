# Best Practices

## 1. Config Synchronization

### Atomic Updates

Always use `runtime.config.writeConfigFile` for atomic updates:

```typescript
// Good: Atomic update
const cfg = await runtime.config.loadConfig();
const updatedCfg = {
  ...cfg,
  agents: {
    ...cfg.agents,
    list: [...(cfg.agents?.list ?? []), newAgent],
  },
  bindings: [...(cfg.bindings ?? []), newBinding],
};
await runtime.config.writeConfigFile(updatedCfg);

// Bad: Manual file manipulation
// await fs.writeFile(configPath, JSON.stringify(config));
```

### Atomic Write Guarantees

`writeConfigFile` provides atomicity:

1. **Temp file + Rename**: Writes to `.tmp` file first, then renames
2. **No partial writes**: Either complete success or no change
3. **Crash recovery**: If crash during write, original file intact

### Proper Cleanup Sequence

Always clean up in correct order:

```typescript
async function shutdownTeam(teamName: string): Promise<void> {
  // 1. Read current state
  const members = await ledger.listMembers();
  const agentIds = members.map((m) => m.agentId);

  // 2. Update config (remove agents & bindings)
  const cfg = await runtime.config.loadConfig();
  const updatedCfg = {
    ...cfg,
    agents: {
      ...cfg.agents,
      list: (cfg.agents?.list ?? []).filter((a) => !agentIds.includes(a.id)),
    },
    bindings: (cfg.bindings ?? []).filter((b) => !agentIds.includes(b.agentId)),
  };
  await runtime.config.writeConfigFile(updatedCfg);

  // 3. Delete team directory (after config is clean)
  await deleteTeamDirectory(teamsDir, teamName);
}
```

---

## 2. Error Handling

### Error Codes

Use consistent error codes:

```typescript
export const ErrorCodes = {
  // Team errors
  TEAM_NOT_FOUND: "TEAM_NOT_FOUND",
  TEAM_ALREADY_EXISTS: "TEAM_ALREADY_EXISTS",
  TEAM_AT_CAPACITY: "TEAM_AT_CAPACITY",
  TEAM_NOT_ACTIVE: "TEAM_NOT_ACTIVE",
  TEAM_ALREADY_SHUTDOWN: "TEAM_ALREADY_SHUTDOWN",
  CONFIG_WRITE_FAILED: "CONFIG_WRITE_FAILED",

  // Teammate errors
  TEAMMATE_NOT_FOUND: "TEAMMATE_NOT_FOUND",
  DUPLICATE_TEAMMATE_NAME: "DUPLICATE_TEAMMATE_NAME",
  INVALID_TEAMMATE_NAME: "INVALID_TEAMMATE_NAME",
  INVALID_AGENT_TYPE: "INVALID_AGENT_TYPE",

  // Task errors
  TASK_NOT_FOUND: "TASK_NOT_FOUND",
  TASK_ALREADY_CLAIMED: "TASK_ALREADY_CLAIMED",
  TASK_ALREADY_COMPLETED: "TASK_ALREADY_COMPLETED",
  TASK_IS_BLOCKED: "TASK_IS_BLOCKED",
  NOT_TASK_OWNER: "NOT_TASK_OWNER",
  CIRCULAR_DEPENDENCY: "CIRCULAR_DEPENDENCY",
  BLOCKING_TASK_NOT_FOUND: "BLOCKING_TASK_NOT_FOUND",
} as const;

export class TeamError extends Error {
  constructor(
    public code: keyof typeof ErrorCodes,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "TeamError";
  }
}
```

### Graceful Degradation

Handle missing/inconsistent state:

```typescript
async function getTeamOrThrow(teamName: string): Promise<TeamConfig> {
  const configPath = resolveTeamConfigPath(teamsDir, teamName);

  if (!fs.existsSync(configPath)) {
    throw new TeamError("TEAM_NOT_FOUND", `Team "${teamName}" not found`);
  }

  try {
    const content = await fs.readFile(configPath, "utf-8");
    return JSON.parse(content);
  } catch (err) {
    console.error(`[agent-team] Failed to read team config:`, err);
    throw new TeamError(
      "TEAM_NOT_FOUND",
      `Team "${teamName}" config is corrupted`
    );
  }
}
```

---

## 3. Naming Conventions

### Agent ID Format

```
teammate-{teamName}-{teammateName}
```

Rules:
- All lowercase
- Alphanumeric, hyphens, underscores only
- Max 64 characters total
- `teamName` and `teammateName` must be valid identifiers

```typescript
const AGENT_ID_PATTERN = /^teammate-[a-z0-9_-]+-[a-z0-9_-]+$/;
const MAX_ID_LENGTH = 64;

function buildAgentId(teamName: string, teammateName: string): string {
  const sanitized = `${teamName}-${teammateName}`
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-");

  const id = `teammate-${sanitized}`;

  if (id.length > MAX_ID_LENGTH) {
    throw new TeamError(
      "INVALID_TEAMMATE_NAME",
      `Agent ID too long (max ${MAX_ID_LENGTH} characters)`
    );
  }

  return id;
}
```

### Binding Peer Format

```
direct:{teamName}:{teammateName}
```

This format allows the routing system to resolve teammates uniquely.

---

## 4. Session Management

### Session Key Format

```
agent:{agentId}:main
```

For teammates:
```
agent:teammate-{teamName}-{teammateName}:main
```

### No Custom Session Recording

With messaging removed, the plugin no longer needs to record sessions. OpenClaw core handles:
- Session storage in standard paths
- Session history via `sessions_history`
- Agent-to-agent communication via `sessions_send`

---

## 5. Security

### Channel Isolation

The `agent-team` channel is isolated from external channels:

```typescript
// Binding only matches agent-team channel
{
  agentId: "teammate-team-agent",
  match: {
    channel: "agent-team",  // Only matches internal channel
    peer: { kind: "direct", id: "team:agent" }
  }
}
```

### Agent ID Collision Prevention

Use unique prefixes:

```typescript
// Teammate agents always start with "teammate-"
// This prevents collision with user-defined agents
const TEAMMATE_PREFIX = "teammate-";

function isTeammateAgent(agentId: string): boolean {
  return agentId.startsWith(TEAMMATE_PREFIX);
}
```

### Workspace Isolation

Each teammate has isolated workspace:

```
~/.openclaw/teams/{team}/agents/{teammate}/workspace/
~/.openclaw/teams/{team}/agents/{teammate}/agent/
```

### Directory Deletion Safety

```typescript
async function deleteTeamDirectory(
  teamsDir: string,
  teamName: string
): Promise<void> {
  // Validate team name to prevent path traversal
  if (!TEAM_NAME_PATTERN.test(teamName)) {
    throw new TeamError("INVALID_TEAM_NAME", `Invalid team name: ${teamName}`);
  }

  const teamDir = join(teamsDir, teamName);

  // Ensure we're not deleting outside teamsDir
  const resolved = resolve(teamDir);
  if (!resolved.startsWith(resolve(teamsDir))) {
    throw new Error("Path traversal detected");
  }

  await rm(teamDir, { recursive: true, force: true });
}
```

---

## 6. Performance

### Avoid Repeated Config Reads

For batch operations, read config once:

```typescript
// Good: Single read for multiple updates
const cfg = await runtime.config.loadConfig();
const teamAgents = new Set(members.map((m) => m.agentId));

const updatedCfg = {
  ...cfg,
  agents: {
    ...cfg.agents,
    list: (cfg.agents?.list ?? []).filter((a) => !teamAgents.has(a.id)),
  },
  bindings: (cfg.bindings ?? []).filter((b) => !teamAgents.has(b.agentId)),
};

await runtime.config.writeConfigFile(updatedCfg);

// Bad: Multiple config reads/writes
for (const member of members) {
  await removeAgentFromConfig(member.agentId); // Each call reads/writes config
}
```

### Use SQLite for Ledger

The `ledger.ts` uses SQLite via `better-sqlite3`:
- Single file database
- ACID transactions
- Fast queries for task/member lookups

---

## 7. Testing

### Test Fixtures

```typescript
// tests/helpers/fixture-factory.ts
export async function createTestTeam(
  ctx: TestContext,
  overrides: Partial<TeamConfig> = {}
): Promise<TeamConfig> {
  const teamName = `test-team-${Date.now()}`;
  const result = await ctx.tools.team_create.handler({
    team_name: teamName,
    ...overrides,
  });
  return result as TeamConfig;
}

export async function createTestTeammate(
  ctx: TestContext,
  teamName: string,
  name: string = `agent-${Date.now()}`
): Promise<{ agentId: string }> {
  const result = await ctx.tools.teammate_spawn.handler({
    team_name: teamName,
    name,
    agent_type: "general-purpose",
  });
  return result as { agentId: string };
}
```

### Mocking Runtime

```typescript
// tests/__mocks__/runtime.ts
export function createMockRuntime(): PluginRuntime {
  let config: OpenClawConfig = { agents: { list: [] }, bindings: [] };

  return {
    config: {
      loadConfig: vi.fn(async () => config),
      writeConfigFile: vi.fn(async (newCfg) => {
        config = newCfg;
      }),
    },
    channel: {
      session: {
        resolveStorePath: vi.fn(() => "/tmp/test-sessions"),
      },
    },
  } as unknown as PluginRuntime;
}
```

### Test Cleanup

```typescript
afterEach(async () => {
  // Clean up test teams
  const teamsDir = join(tmpdir(), "test-teams");
  await rm(teamsDir, { recursive: true, force: true });
});
```
