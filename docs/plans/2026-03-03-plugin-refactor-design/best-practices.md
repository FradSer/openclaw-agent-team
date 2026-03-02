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

### Idempotent Operations

Check for existing entities before creating:

```typescript
async function createAgent(config: DynamicAgentConfig) {
  const cfg = await runtime.config.loadConfig();

  // Check for existing agent
  const existingAgent = cfg.agents?.list?.find(a => a.id === config.agentId);
  if (existingAgent) {
    // Agent exists - ensure binding exists
    const hasBinding = cfg.bindings?.some(
      b => b.agentId === config.agentId &&
           b.match?.channel === "agent-team"
    );
    if (!hasBinding) {
      return await addBindingOnly(cfg, config);
    }
    return { agentId: config.agentId, created: false };
  }

  // Create new agent + binding
  return await createNewAgent(cfg, config);
}
```

### Proper Cleanup Sequence

Always remove in correct order:

```typescript
async function removeAgent(agentId: string): Promise<void> {
  const cfg = await runtime.config.loadConfig();

  // 1. Remove bindings first (dependent on agent)
  const updatedBindings = (cfg.bindings ?? []).filter(
    b => b.agentId !== agentId
  );

  // 2. Remove agent entry
  const updatedAgents = (cfg.agents?.list ?? []).filter(
    a => a.id !== agentId
  );

  // 3. Atomic write
  const updatedCfg = {
    ...cfg,
    agents: { ...cfg.agents, list: updatedAgents },
    bindings: updatedBindings,
  };

  await runtime.config.writeConfigFile(updatedCfg);
}
```

### Atomic Write Guarantees

`writeConfigFile` provides atomicity:

1. **Temp file + Rename**: Writes to `.tmp` file first, then renames
2. **No partial writes**: Either complete success or no change
3. **Crash recovery**: If crash during write, original file intact

```typescript
// writeConfigFile implementation pattern (in OpenClaw core):
async function writeConfigFile(config: OpenClawConfig): Promise<void> {
  const configPath = resolveConfigPath();
  const tempPath = `${configPath}.tmp`;

  // 1. Write to temp file
  await fs.writeFile(tempPath, JSON.stringify(config, null, 2));

  // 2. Atomic rename (POSIX guarantees atomicity)
  await fs.rename(tempPath, configPath);
}
```

**Testing atomicity:**
```gherkin
Scenario: Config write is atomic
  Given an active team "atomic-team"
  When a crash occurs during teammate spawn
  Then openclaw.json should be in a consistent state
  And either the agent exists completely or not at all
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

  // Teammate errors
  TEAMMATE_NOT_FOUND: "TEAMMATE_NOT_FOUND",
  DUPLICATE_TEAMMATE_NAME: "DUPLICATE_TEAMMATE_NAME",

  // Task errors
  TASK_NOT_FOUND: "TASK_NOT_FOUND",
  TASK_ALREADY_CLAIMED: "TASK_ALREADY_CLAIMED",
  TASK_IS_BLOCKED: "TASK_IS_BLOCKED",
  NOT_TASK_OWNER: "NOT_TASK_OWNER",
  CIRCULAR_DEPENDENCY: "CIRCULAR_DEPENDENCY",
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
    // Log but don't expose internal errors
    console.error(`[agent-team] Failed to read team config:`, err);
    throw new TeamError("TEAM_NOT_FOUND", `Team "${teamName}" config is corrupted`);
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

### Recording Sessions

Use core's session management:

```typescript
await core.channel.session.recordInboundSession({
  storePath,
  sessionKey,
  ctx: ctxPayload,
  createIfMissing: true,
  updateLastRoute: {
    sessionKey,
    channel: "agent-team",
    to: `${teamName}:${teammateName}`,
    accountId: "default",
  },
  onRecordError: (err) => {
    console.error(`[agent-team] Failed to record session:`, err);
  },
});
```

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

---

## 6. Performance

### Caching

Cache config reads during batch operations:

```typescript
class AgentManager {
  private configCache: OpenClawConfig | null = null;
  private cacheExpiry = 0;
  private readonly CACHE_TTL_MS = 5000;

  private async getConfig(): Promise<OpenClawConfig> {
    const now = Date.now();
    if (this.configCache && now < this.cacheExpiry) {
      return this.configCache;
    }

    this.configCache = await this.runtime.config.loadConfig();
    this.cacheExpiry = now + this.CACHE_TTL_MS;
    return this.configCache;
  }

  invalidateCache() {
    this.configCache = null;
    this.cacheExpiry = 0;
  }
}
```

### JSONL Handling

For large teams, use streaming:

```typescript
// For reading large files
async function* streamJsonl<T>(filePath: string): AsyncGenerator<T> {
  const stream = fs.createReadStream(filePath, { encoding: "utf-8" });
  let buffer = "";

  for await (const chunk of stream) {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.trim()) {
        yield JSON.parse(line);
      }
    }
  }

  if (buffer.trim()) {
    yield JSON.parse(buffer);
  }
}
```

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
    agent_type: "General",
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
        recordInboundSession: vi.fn(),
        updateLastRoute: vi.fn(),
      },
      reply: {
        dispatchReplyFromConfig: vi.fn(),
      },
    },
    // ... other mocks
  } as unknown as PluginRuntime;
}
```
