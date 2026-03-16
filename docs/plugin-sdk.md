# OpenClaw Plugin SDK Reference

Source: `/Users/FradSer/Developer/FradSer/openclaw` (local source, verified 2026-03-14)
Key files:
- `src/plugins/types.ts` — OpenClawPluginApi, tool/hook types
- `src/plugins/runtime/types-core.ts` — PluginRuntimeCore
- `src/plugins/runtime/types.ts` — PluginRuntime
- `src/plugin-sdk/core.ts` — public SDK exports (core)
- `src/plugin-sdk/index.ts` — public SDK exports (full)
- `src/gateway/server-methods/agents.ts` — agents.create/update/delete RPC
- `src/commands/agents.config.ts` — applyAgentConfig()

---

## OpenClawPluginDefinition

Defined in `src/plugins/types.ts:351-360`. The plugin entry point shape.

```typescript
type OpenClawPluginDefinition = {
  id?: string;
  name?: string;
  description?: string;
  version?: string;
  kind?: PluginKind;                              // "memory" | "context-engine"
  configSchema?: OpenClawPluginConfigSchema;
  register?: (api: OpenClawPluginApi) => void | Promise<void>;
  activate?: (api: OpenClawPluginApi) => void | Promise<void>;
};
```

## OpenClawPluginModule

Defined in `src/plugins/types.ts:362-364`. A plugin export is either a definition object or a bare register function.

```typescript
type OpenClawPluginModule =
  | OpenClawPluginDefinition
  | ((api: OpenClawPluginApi) => void | Promise<void>);
```

---

## OpenClawPluginApi

Defined in `src/plugins/types.ts:366-409`.

```typescript
type OpenClawPluginApi = {
  id: string;
  name: string;
  version?: string;
  description?: string;
  source: string;
  config: OpenClawConfig;
  pluginConfig?: Record<string, unknown>;
  runtime: PluginRuntime;
  logger: PluginLogger;
  registerTool: (
    tool: AnyAgentTool | OpenClawPluginToolFactory,
    opts?: OpenClawPluginToolOptions,
  ) => void;
  registerHook: (
    events: string | string[],
    handler: InternalHookHandler,
    opts?: OpenClawPluginHookOptions,
  ) => void;
  registerHttpRoute: (params: OpenClawPluginHttpRouteParams) => void;
  registerChannel: (registration: OpenClawPluginChannelRegistration | ChannelPlugin) => void;
  registerGatewayMethod: (method: string, handler: GatewayRequestHandler) => void;
  registerCli: (registrar: OpenClawPluginCliRegistrar, opts?: { commands?: string[] }) => void;
  registerService: (service: OpenClawPluginService) => void;
  registerProvider: (provider: ProviderPlugin) => void;
  registerCommand: (command: OpenClawPluginCommandDefinition) => void;
  registerContextEngine: (
    id: string,
    factory: ContextEngineFactory,
  ) => void;
  resolvePath: (input: string) => string;
  on: <K extends PluginHookName>(
    hookName: K,
    handler: PluginHookHandlerMap[K],
    opts?: { priority?: number },
  ) => void;
};
```

---

## PluginRuntimeCore

Defined in `src/plugins/runtime/types-core.ts:10-67`.

```typescript
type PluginRuntimeCore = {
  version: string;
  config: {
    loadConfig: typeof import("../../config/config.js").loadConfig;
    writeConfigFile: typeof import("../../config/config.js").writeConfigFile;
  };
  system: {
    enqueueSystemEvent: typeof import("../../infra/system-events.js").enqueueSystemEvent;
    requestHeartbeatNow: typeof import("../../infra/heartbeat-wake.js").requestHeartbeatNow;
    runCommandWithTimeout: typeof import("../../process/exec.js").runCommandWithTimeout;
    formatNativeDependencyHint: typeof import("./native-deps.js").formatNativeDependencyHint;
  };
  media: {
    loadWebMedia: typeof import("../../web/media.js").loadWebMedia;
    detectMime: typeof import("../../media/mime.js").detectMime;
    mediaKindFromMime: typeof import("../../media/constants.js").mediaKindFromMime;
    isVoiceCompatibleAudio: typeof import("../../media/audio.js").isVoiceCompatibleAudio;
    getImageMetadata: typeof import("../../media/image-ops.js").getImageMetadata;
    resizeToJpeg: typeof import("../../media/image-ops.js").resizeToJpeg;
  };
  tts: {
    textToSpeechTelephony: typeof import("../../tts/tts.js").textToSpeechTelephony;
  };
  stt: {
    transcribeAudioFile: typeof import("../../media-understanding/transcribe-audio.js").transcribeAudioFile;
  };
  tools: {
    createMemoryGetTool: typeof import("../../agents/tools/memory-tool.js").createMemoryGetTool;
    createMemorySearchTool: typeof import("../../agents/tools/memory-tool.js").createMemorySearchTool;
    registerMemoryCli: typeof import("../../cli/memory-cli.js").registerMemoryCli;
  };
  events: {
    onAgentEvent: typeof import("../../infra/agent-events.js").onAgentEvent;
    onSessionTranscriptUpdate: typeof import("../../sessions/transcript-events.js").onSessionTranscriptUpdate;
  };
  logging: {
    shouldLogVerbose: typeof import("../../globals.js").shouldLogVerbose;
    getChildLogger: (
      bindings?: Record<string, unknown>,
      opts?: { level?: LogLevel },
    ) => RuntimeLogger;
  };
  state: {
    resolveStateDir: typeof import("../../config/paths.js").resolveStateDir;
  };
  modelAuth: {
    getApiKeyForModel: (params: {
      model: import("@mariozechner/pi-ai").Model<import("@mariozechner/pi-ai").Api>;
      cfg?: import("../../config/config.js").OpenClawConfig;
    }) => Promise<ResolvedProviderAuth>;
    resolveApiKeyForProvider: (params: {
      provider: string;
      cfg?: import("../../config/config.js").OpenClawConfig;
    }) => Promise<ResolvedProviderAuth>;
  };
};
```

---

## PluginRuntime

Defined in `src/plugins/runtime/types.ts:51-63`.

```typescript
type PluginRuntime = PluginRuntimeCore & {
  subagent: {
    run: (params: SubagentRunParams) => Promise<SubagentRunResult>;
    waitForRun: (params: SubagentWaitParams) => Promise<SubagentWaitResult>;
    getSessionMessages: (
      params: SubagentGetSessionMessagesParams,
    ) => Promise<SubagentGetSessionMessagesResult>;
    /** @deprecated Use getSessionMessages. */
    getSession: (params: SubagentGetSessionParams) => Promise<SubagentGetSessionResult>;
    deleteSession: (params: SubagentDeleteSessionParams) => Promise<void>;
  };
  channel: PluginRuntimeChannel;  // Large internal type, not fully documented (30+ fields)
};
```

### Subagent Parameters & Results

```typescript
// src/plugins/runtime/types.ts:8-49

type SubagentRunParams = {
  sessionKey: string;
  message: string;
  extraSystemPrompt?: string;
  lane?: string;
  deliver?: boolean;
  idempotencyKey?: string;
};

type SubagentRunResult = {
  runId: string;
};

type SubagentWaitParams = {
  runId: string;
  timeoutMs?: number;
};

type SubagentWaitResult = {
  status: "ok" | "error" | "timeout";
  error?: string;
};

type SubagentGetSessionMessagesParams = {
  sessionKey: string;
  limit?: number;
};

type SubagentGetSessionMessagesResult = {
  messages: unknown[];
};

/** @deprecated Use SubagentGetSessionMessagesParams. */
type SubagentGetSessionParams = SubagentGetSessionMessagesParams;

/** @deprecated Use SubagentGetSessionMessagesResult. */
type SubagentGetSessionResult = SubagentGetSessionMessagesResult;

type SubagentDeleteSessionParams = {
  sessionKey: string;
  deleteTranscript?: boolean;
};
```

---

## OpenClawPluginToolContext

Defined in `src/plugins/types.ts:63-78`.

```typescript
type OpenClawPluginToolContext = {
  config?: OpenClawConfig;
  workspaceDir?: string;
  agentDir?: string;
  agentId?: string;
  sessionKey?: string;
  /** Ephemeral session UUID — regenerated on /new and /reset. Use for per-conversation isolation. */
  sessionId?: string;
  messageChannel?: string;
  agentAccountId?: string;
  /** Trusted sender id from inbound context (runtime-provided, not tool args). */
  requesterSenderId?: string;
  /** Whether the trusted sender is an owner. */
  senderIsOwner?: boolean;
  sandboxed?: boolean;
};
```

---

## Registration Option Types

### OpenClawPluginToolOptions

Defined in `src/plugins/types.ts:84-88`.

```typescript
type OpenClawPluginToolOptions = {
  name?: string;
  names?: string[];
  optional?: boolean;
};
```

### OpenClawPluginHookOptions

Defined in `src/plugins/types.ts:90-95`.

```typescript
type OpenClawPluginHookOptions = {
  entry?: HookEntry;
  name?: string;
  description?: string;
  register?: boolean;
};
```

### OpenClawPluginHttpRouteParams

Defined in `src/plugins/types.ts:316-322`.

```typescript
type OpenClawPluginHttpRouteParams = {
  path: string;
  handler: OpenClawPluginHttpRouteHandler;
  auth: OpenClawPluginHttpRouteAuth;
  match?: OpenClawPluginHttpRouteMatch;
  replaceExisting?: boolean;
};

type OpenClawPluginHttpRouteAuth = "gateway" | "plugin";
type OpenClawPluginHttpRouteMatch = "exact" | "prefix";

type OpenClawPluginHttpRouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<boolean | void> | boolean | void;
```

### OpenClawPluginCliRegistrar & OpenClawPluginCliContext

Defined in `src/plugins/types.ts:324-331`.

```typescript
type OpenClawPluginCliContext = {
  program: Command;
  config: OpenClawConfig;
  workspaceDir?: string;
  logger: PluginLogger;
};

type OpenClawPluginCliRegistrar = (ctx: OpenClawPluginCliContext) => void | Promise<void>;
```

### OpenClawPluginService & OpenClawPluginServiceContext

Defined in `src/plugins/types.ts:333-344`.

```typescript
type OpenClawPluginServiceContext = {
  config: OpenClawConfig;
  workspaceDir?: string;
  stateDir: string;
  logger: PluginLogger;
};

type OpenClawPluginService = {
  id: string;
  start: (ctx: OpenClawPluginServiceContext) => void | Promise<void>;
  stop?: (ctx: OpenClawPluginServiceContext) => void | Promise<void>;
};
```

### OpenClawPluginChannelRegistration

Defined in `src/plugins/types.ts:346-349`.

```typescript
type OpenClawPluginChannelRegistration = {
  plugin: ChannelPlugin;
  dock?: ChannelDock;
};
```

### OpenClawPluginCommandDefinition

Defined in `src/plugins/types.ts:289-306`.

```typescript
type OpenClawPluginCommandDefinition = {
  /** Command name without leading slash (e.g., "tts") */
  name: string;
  /**
   * Optional native-command aliases for slash/menu surfaces.
   * `default` applies to all native providers unless a provider-specific
   * override exists (for example `{ default: "talkvoice", discord: "voice2" }`).
   */
  nativeNames?: Partial<Record<string, string>> & { default?: string };
  /** Description shown in /help and command menus */
  description: string;
  /** Whether this command accepts arguments */
  acceptsArgs?: boolean;
  /** Whether only authorized senders can use this command (default: true) */
  requireAuth?: boolean;
  /** The handler function */
  handler: PluginCommandHandler;
};

type PluginCommandHandler = (
  ctx: PluginCommandContext,
) => PluginCommandResult | Promise<PluginCommandResult>;

type PluginCommandContext = {
  senderId?: string;
  channel: string;
  channelId?: ChannelId;
  isAuthorizedSender: boolean;
  args?: string;
  commandBody: string;
  config: OpenClawConfig;
  from?: string;
  to?: string;
  accountId?: string;
  messageThreadId?: number;
};

type PluginCommandResult = ReplyPayload;
```

---

## PluginHookName — Complete 24-Hook List

Defined in `src/plugins/types.ts:424-448`.

```typescript
type PluginHookName =
  | "before_model_resolve"
  | "before_prompt_build"
  | "before_agent_start"
  | "llm_input"
  | "llm_output"
  | "agent_end"
  | "before_compaction"
  | "after_compaction"
  | "before_reset"
  | "message_received"
  | "message_sending"
  | "message_sent"
  | "before_tool_call"
  | "after_tool_call"
  | "tool_result_persist"
  | "before_message_write"
  | "session_start"
  | "session_end"
  | "subagent_spawning"
  | "subagent_delivery_target"
  | "subagent_spawned"
  | "subagent_ended"
  | "gateway_start"
  | "gateway_stop";
```

---

## Hook Event & Result Types

### Agent Context

```typescript
// Shared across agent hooks (src/plugins/types.ts:500-510)
type PluginHookAgentContext = {
  agentId?: string;
  sessionKey?: string;
  sessionId?: string;
  workspaceDir?: string;
  messageProvider?: string;
  trigger?: string;  // "user", "heartbeat", "cron", or "memory"
  channelId?: string;
};
```

### before_model_resolve

```typescript
type PluginHookBeforeModelResolveEvent = {
  prompt: string;
};

type PluginHookBeforeModelResolveResult = {
  modelOverride?: string;
  providerOverride?: string;
};
```

### before_prompt_build

```typescript
type PluginHookBeforePromptBuildEvent = {
  prompt: string;
  messages: unknown[];
};

type PluginHookBeforePromptBuildResult = {
  systemPrompt?: string;
  prependContext?: string;
  prependSystemContext?: string;
  appendSystemContext?: string;
};
```

### before_agent_start

```typescript
type PluginHookBeforeAgentStartEvent = {
  prompt: string;
  messages?: unknown[];
};

type PluginHookBeforeAgentStartResult = PluginHookBeforePromptBuildResult &
  PluginHookBeforeModelResolveResult;
```

### llm_input

```typescript
type PluginHookLlmInputEvent = {
  runId: string;
  sessionId: string;
  provider: string;
  model: string;
  systemPrompt?: string;
  prompt: string;
  historyMessages: unknown[];
  imagesCount: number;
};
```

### llm_output

```typescript
type PluginHookLlmOutputEvent = {
  runId: string;
  sessionId: string;
  provider: string;
  model: string;
  assistantTexts: string[];
  lastAssistant?: unknown;
  usage?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    total?: number;
  };
};
```

### agent_end

```typescript
type PluginHookAgentEndEvent = {
  messages: unknown[];
  success: boolean;
  error?: string;
  durationMs?: number;
};
```

### Compaction Hooks

```typescript
type PluginHookBeforeCompactionEvent = {
  messageCount: number;
  compactingCount?: number;
  tokenCount?: number;
  messages?: unknown[];
  sessionFile?: string;
};

type PluginHookAfterCompactionEvent = {
  messageCount: number;
  tokenCount?: number;
  compactedCount: number;
  sessionFile?: string;
};

type PluginHookBeforeResetEvent = {
  sessionFile?: string;
  messages?: unknown[];
  reason?: string;
};
```

### Message Context

```typescript
type PluginHookMessageContext = {
  channelId: string;
  accountId?: string;
  conversationId?: string;
};

type PluginHookMessageReceivedEvent = {
  from: string;
  content: string;
  timestamp?: number;
  metadata?: Record<string, unknown>;
};

type PluginHookMessageSendingEvent = {
  to: string;
  content: string;
  metadata?: Record<string, unknown>;
};

type PluginHookMessageSendingResult = {
  content?: string;
  cancel?: boolean;
};

type PluginHookMessageSentEvent = {
  to: string;
  content: string;
  success: boolean;
  error?: string;
};
```

### Tool Context

```typescript
type PluginHookToolContext = {
  agentId?: string;
  sessionKey?: string;
  sessionId?: string;
  runId?: string;
  toolName: string;
  toolCallId?: string;
};

type PluginHookBeforeToolCallEvent = {
  toolName: string;
  params: Record<string, unknown>;
  runId?: string;
  toolCallId?: string;
};

type PluginHookBeforeToolCallResult = {
  params?: Record<string, unknown>;
  block?: boolean;
  blockReason?: string;
};

type PluginHookAfterToolCallEvent = {
  toolName: string;
  params: Record<string, unknown>;
  runId?: string;
  toolCallId?: string;
  result?: unknown;
  error?: string;
  durationMs?: number;
};

type PluginHookToolResultPersistContext = {
  agentId?: string;
  sessionKey?: string;
  toolName?: string;
  toolCallId?: string;
};

type PluginHookToolResultPersistEvent = {
  toolName?: string;
  toolCallId?: string;
  message: AgentMessage;
  isSynthetic?: boolean;
};

type PluginHookToolResultPersistResult = {
  message?: AgentMessage;
};

type PluginHookBeforeMessageWriteEvent = {
  message: AgentMessage;
  sessionKey?: string;
  agentId?: string;
};

type PluginHookBeforeMessageWriteResult = {
  block?: boolean;
  message?: AgentMessage;
};
```

### Session Context

```typescript
type PluginHookSessionContext = {
  agentId?: string;
  sessionId: string;
  sessionKey?: string;
};

type PluginHookSessionStartEvent = {
  sessionId: string;
  sessionKey?: string;
  resumedFrom?: string;
};

type PluginHookSessionEndEvent = {
  sessionId: string;
  sessionKey?: string;
  messageCount: number;
  durationMs?: number;
};
```

### Subagent Context

```typescript
type PluginHookSubagentContext = {
  runId?: string;
  childSessionKey?: string;
  requesterSessionKey?: string;
};

type PluginHookSubagentSpawningEvent = {
  childSessionKey: string;
  agentId: string;
  label?: string;
  mode: "run" | "session";
  requester?: {
    channel?: string;
    accountId?: string;
    to?: string;
    threadId?: string | number;
  };
  threadRequested: boolean;
};

type PluginHookSubagentSpawningResult =
  | { status: "ok"; threadBindingReady?: boolean }
  | { status: "error"; error: string };

type PluginHookSubagentDeliveryTargetEvent = {
  childSessionKey: string;
  requesterSessionKey: string;
  requesterOrigin?: {
    channel?: string;
    accountId?: string;
    to?: string;
    threadId?: string | number;
  };
  childRunId?: string;
  spawnMode?: "run" | "session";
  expectsCompletionMessage: boolean;
};

type PluginHookSubagentDeliveryTargetResult = {
  origin?: {
    channel?: string;
    accountId?: string;
    to?: string;
    threadId?: string | number;
  };
};

type PluginHookSubagentSpawnedEvent = PluginHookSubagentSpawningEvent & {
  runId: string;
};

type PluginHookSubagentEndedEvent = {
  targetSessionKey: string;
  targetKind: "subagent" | "acp";
  reason: string;
  sendFarewell?: boolean;
  accountId?: string;
  runId?: string;
  endedAt?: number;
  outcome?: "ok" | "error" | "timeout" | "killed" | "reset" | "deleted";
  error?: string;
};
```

### Gateway Context

```typescript
type PluginHookGatewayContext = {
  port?: number;
};

type PluginHookGatewayStartEvent = {
  port: number;
};

type PluginHookGatewayStopEvent = {
  reason?: string;
};
```

---

## PluginHookHandlerMap

Defined in `src/plugins/types.ts:890-987`.

```typescript
type PluginHookHandlerMap = {
  before_model_resolve: (
    event: PluginHookBeforeModelResolveEvent,
    ctx: PluginHookAgentContext,
  ) => Promise<PluginHookBeforeModelResolveResult | void> | PluginHookBeforeModelResolveResult | void;
  before_prompt_build: (
    event: PluginHookBeforePromptBuildEvent,
    ctx: PluginHookAgentContext,
  ) => Promise<PluginHookBeforePromptBuildResult | void> | PluginHookBeforePromptBuildResult | void;
  before_agent_start: (
    event: PluginHookBeforeAgentStartEvent,
    ctx: PluginHookAgentContext,
  ) => Promise<PluginHookBeforeAgentStartResult | void> | PluginHookBeforeAgentStartResult | void;
  llm_input: (event: PluginHookLlmInputEvent, ctx: PluginHookAgentContext) => Promise<void> | void;
  llm_output: (
    event: PluginHookLlmOutputEvent,
    ctx: PluginHookAgentContext,
  ) => Promise<void> | void;
  agent_end: (event: PluginHookAgentEndEvent, ctx: PluginHookAgentContext) => Promise<void> | void;
  before_compaction: (
    event: PluginHookBeforeCompactionEvent,
    ctx: PluginHookAgentContext,
  ) => Promise<void> | void;
  after_compaction: (
    event: PluginHookAfterCompactionEvent,
    ctx: PluginHookAgentContext,
  ) => Promise<void> | void;
  before_reset: (
    event: PluginHookBeforeResetEvent,
    ctx: PluginHookAgentContext,
  ) => Promise<void> | void;
  message_received: (
    event: PluginHookMessageReceivedEvent,
    ctx: PluginHookMessageContext,
  ) => Promise<void> | void;
  message_sending: (
    event: PluginHookMessageSendingEvent,
    ctx: PluginHookMessageContext,
  ) => Promise<PluginHookMessageSendingResult | void> | PluginHookMessageSendingResult | void;
  message_sent: (
    event: PluginHookMessageSentEvent,
    ctx: PluginHookMessageContext,
  ) => Promise<void> | void;
  before_tool_call: (
    event: PluginHookBeforeToolCallEvent,
    ctx: PluginHookToolContext,
  ) => Promise<PluginHookBeforeToolCallResult | void> | PluginHookBeforeToolCallResult | void;
  after_tool_call: (
    event: PluginHookAfterToolCallEvent,
    ctx: PluginHookToolContext,
  ) => Promise<void> | void;
  tool_result_persist: (
    event: PluginHookToolResultPersistEvent,
    ctx: PluginHookToolResultPersistContext,
  ) => PluginHookToolResultPersistResult | void;
  before_message_write: (
    event: PluginHookBeforeMessageWriteEvent,
    ctx: { agentId?: string; sessionKey?: string },
  ) => PluginHookBeforeMessageWriteResult | void;
  session_start: (
    event: PluginHookSessionStartEvent,
    ctx: PluginHookSessionContext,
  ) => Promise<void> | void;
  session_end: (
    event: PluginHookSessionEndEvent,
    ctx: PluginHookSessionContext,
  ) => Promise<void> | void;
  subagent_spawning: (
    event: PluginHookSubagentSpawningEvent,
    ctx: PluginHookSubagentContext,
  ) => Promise<PluginHookSubagentSpawningResult | void> | PluginHookSubagentSpawningResult | void;
  subagent_delivery_target: (
    event: PluginHookSubagentDeliveryTargetEvent,
    ctx: PluginHookSubagentContext,
  ) => Promise<PluginHookSubagentDeliveryTargetResult | void> | PluginHookSubagentDeliveryTargetResult | void;
  subagent_spawned: (
    event: PluginHookSubagentSpawnedEvent,
    ctx: PluginHookSubagentContext,
  ) => Promise<void> | void;
  subagent_ended: (
    event: PluginHookSubagentEndedEvent,
    ctx: PluginHookSubagentContext,
  ) => Promise<void> | void;
  gateway_start: (
    event: PluginHookGatewayStartEvent,
    ctx: PluginHookGatewayContext,
  ) => Promise<void> | void;
  gateway_stop: (
    event: PluginHookGatewayStopEvent,
    ctx: PluginHookGatewayContext,
  ) => Promise<void> | void;
};
```

---

## Supporting Types

### PluginLogger

Defined in `src/plugins/types.ts:27-32`.

```typescript
type PluginLogger = {
  debug?: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};
```

### RuntimeLogger

Defined in `src/plugins/runtime/types-core.ts:3-8`.

```typescript
type RuntimeLogger = {
  debug?: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
};
```

### LogLevel

Defined in `src/logging/levels.ts`.

```typescript
type LogLevel = "silent" | "fatal" | "error" | "warn" | "info" | "debug" | "trace";
```

### ResolvedProviderAuth

Defined in `src/agents/model-auth.ts:209-214`.

```typescript
type ResolvedProviderAuth = {
  apiKey?: string;
  profileId?: string;
  source: string;
  mode: "api-key" | "oauth" | "token" | "aws-sdk";
};
```

### ProviderPlugin

Defined in `src/plugins/types.ts:222-235`.

```typescript
type ProviderPlugin = {
  id: string;
  pluginId?: string;
  label: string;
  docsPath?: string;
  aliases?: string[];
  envVars?: string[];
  auth: ProviderAuthMethod[];
  discovery?: ProviderPluginDiscovery;
  wizard?: ProviderPluginWizard;
  formatApiKey?: (cred: AuthProfileCredential) => string;
  refreshOAuth?: (cred: OAuthCredential) => Promise<OAuthCredential>;
  onModelSelected?: (ctx: ProviderModelSelectedContext) => Promise<void>;
};
```

### AnyAgentTool

```typescript
type AnyAgentTool = AgentTool<any, unknown> & { ownerOnly?: boolean };
```

### ChannelPlugin

Reference only — large internal type with 30+ fields. See `src/channels/plugins/types.plugin.js`.

### InternalHookHandler

```typescript
// src/hooks/internal-hooks.ts
type InternalHookHandler = (
  event: unknown,
  context: unknown,
) => Promise<unknown> | unknown;
```

### GatewayRequestHandler

```typescript
// src/gateway/server-methods/types.ts
type GatewayRequestHandler = (
  params: GatewayRequestHandlerOptions,
) => Promise<void>;

type GatewayRequestHandlerOptions = {
  params: Record<string, unknown>;
  respond: RespondFn;
};

type RespondFn = (
  ok: boolean,
  result?: unknown,
  error?: { code: string; message: string },
) => void;
```

### ContextEngineFactory

```typescript
// src/context-engine/registry.ts
type ContextEngineFactory = (
  runtime: PluginRuntime,
  config: OpenClawConfig,
) => ContextEngine;
```

---

## Plugin SDK Public Exports

### `src/plugin-sdk/core.ts` — Core Exports

Key categories:
- **Plugin Types**: `AnyAgentTool`, `OpenClawPluginApi`, `ProviderPlugin`, `PluginRuntime`
- **Config**: `OpenClawConfig`, `emptyPluginConfigSchema`
- **Provider Auth**: `ProviderAuthContext`, `ProviderAuthResult`, `buildOauthProviderAuthResult`
- **Channel**: `ChannelPlugin`
- **Helpers**: `runPluginCommandWithTimeout`, `resolveGatewayBindUrl`, `resolveTailnetHostWithRunner`
- **Security**: `loadSecretFileSync`, `readSecretFileSync`, `tryReadSecretFileSync`

### `src/plugin-sdk/index.ts` — Full SDK Exports

Comprehensive exports including:
- **Channel Types**: Full channel adapter interfaces (Discord, Slack, Telegram, WhatsApp, iMessage, Signal, LINE, BlueBubbles)
- **ACP Runtime**: `AcpRuntime`, `AcpRuntimeControl`, `AcpRuntimeEvent`
- **Config Schemas**: `DiscordConfigSchema`, `SlackConfigSchema`, `TelegramConfigSchema`, etc.
- **Runtime Helpers**: `createLoggerBackedRuntime`, `resolveRuntimeEnv`
- **Security**: `resolveSenderCommandAuthorization`, `evaluateGroupRouteAccessForPolicy`
- **Diagnostics**: `DiagnosticEventPayload`, `DiagnosticSessionState`
- **UI/Formatting**: `formatZonedTimestamp`, `chunkTextForOutbound`
- **Webhook**: `registerWebhookTarget`, `resolveWebhookTargets`, `withResolvedWebhookRequestPipeline`

---

## Gateway RPC & applyAgentConfig

### agents.create

```typescript
// Params (src/gateway/protocol/schema/agents-models-skills.ts:47-55)
type AgentsCreateParams = {
  name: string;
  workspace: string;
  emoji?: string;
  avatar?: string;
};

// Result
type AgentsCreateResult = {
  ok: true;
  agentId: string;
  name: string;
  workspace: string;
};
```

### agents.update

```typescript
// Params (src/gateway/protocol/schema/agents-models-skills.ts:67-76)
type AgentsUpdateParams = {
  agentId: string;
  name?: string;
  workspace?: string;
  model?: string;
  avatar?: string;
};

// Result
type AgentsUpdateResult = {
  ok: true;
  agentId: string;
};
```

### agents.delete

```typescript
// Params (src/gateway/protocol/schema/agents-models-skills.ts:86-92)
type AgentsDeleteParams = {
  agentId: string;
  deleteFiles?: boolean;  // default: true
};

// Result
type AgentsDeleteResult = {
  ok: true;
  agentId: string;
  removedBindings: number;
};
```

### applyAgentConfig

Defined in `src/commands/agents.config.ts:127-165`.

```typescript
function applyAgentConfig(
  cfg: OpenClawConfig,
  params: {
    agentId: string;
    name?: string;
    workspace?: string;
    agentDir?: string;
    model?: string;
  },
): OpenClawConfig
```

**Note**: `runtime.config` (accessible via `api.runtime`) provides direct access to the agent config and is the public API for reading/writing agent configuration. The `applyAgentConfig()` function is exported from `src/commands/agents.config.ts` for direct manipulation.

**Note**: `agents.create` and `agents.update` do not accept `agentDir` or `bindings` parameters — these are derived automatically by OpenClaw.

---

## Notes

1. **`runtime.config` is public API**: The `runtime.config` namespace (part of `PluginRuntimeCore`) provides `loadConfig` and `writeConfigFile` for direct configuration access. Plugins should use this for reading/writing OpenClaw config rather than importing internal config modules.

2. **`agents.create` lacks `agentDir`/`bindings`**: The Gateway RPC methods for agent management do not expose `agentDir` or `bindings` parameters. These are automatically derived by OpenClaw from the agent ID and workspace path.

3. **`ChannelPlugin` is large**: The full `ChannelPlugin` type has 30+ fields and represents a significant internal abstraction. Refer to `src/channels/plugins/types.plugin.js` for the complete definition.

4. **Hook handler signatures**: Each hook in `PluginHookHandlerMap` has a specific event type and context type. The event is the input data, and the context provides runtime information about the agent/session/tool.

5. **Subagent deprecation**: `SubagentGetSessionParams` and `SubagentGetSessionResult` are deprecated in favor of `SubagentGetSessionMessagesParams` and `SubagentGetSessionMessagesResult`.
