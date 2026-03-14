# OpenClaw Plugin SDK Reference

Source: `/Users/FradSer/Developer/FradSer/openclaw` (local source, verified 2026-03-14)
Key files:
- `src/plugins/types.ts` — OpenClawPluginApi, tool/hook types
- `src/plugins/runtime/types-core.ts` — PluginRuntimeCore
- `src/plugins/runtime/types.ts` — PluginRuntime
- `src/plugin-sdk/core.ts` — public SDK exports
- `src/gateway/server-methods/agents.ts` — agents.create/update RPC
- `src/commands/agents.config.ts` — applyAgentConfig()

---

## OpenClawPluginApi

Defined in `src/plugins/types.ts`.

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
  registerTool: (tool: AnyAgentTool | OpenClawPluginToolFactory, opts?: OpenClawPluginToolOptions) => void;
  registerHook: (events: string | string[], handler: InternalHookHandler, opts?: OpenClawPluginHookOptions) => void;
  registerHttpRoute: (params: OpenClawPluginHttpRouteParams) => void;
  registerChannel: (registration: OpenClawPluginChannelRegistration | ChannelPlugin) => void;
  registerGatewayMethod: (method: string, handler: GatewayRequestHandler) => void;
  registerCli: (registrar: OpenClawPluginCliRegistrar, opts?: { commands?: string[] }) => void;
  registerService: (service: OpenClawPluginService) => void;
  registerProvider: (provider: ProviderPlugin) => void;
  registerCommand: (command: OpenClawPluginCommandDefinition) => void;
  registerContextEngine: (id: string, factory: ContextEngineFactory) => void;
  resolvePath: (input: string) => string;
  on: <K extends PluginHookName>(hookName: K, handler: PluginHookHandlerMap[K], opts?: { priority?: number }) => void;
};
```

---

## PluginRuntimeCore

Defined in `src/plugins/runtime/types-core.ts:10-67`.
`runtime.config.loadConfig` and `runtime.config.writeConfigFile` are **official public API**.

```typescript
export type PluginRuntimeCore = {
  version: string;
  config: {
    loadConfig: typeof import("../../config/config.js").loadConfig;
    writeConfigFile: typeof import("../../config/config.js").writeConfigFile;
  };
  system: {
    enqueueSystemEvent: ...;
    requestHeartbeatNow: ...;
    runCommandWithTimeout: ...;
    formatNativeDependencyHint: ...;
  };
  media: {
    loadWebMedia: ...;
    detectMime: ...;
    mediaKindFromMime: ...;
    isVoiceCompatibleAudio: ...;
    getImageMetadata: ...;
    resizeToJpeg: ...;
  };
  tts: {
    textToSpeechTelephony: ...;
  };
  stt: {
    transcribeAudioFile: ...;
  };
  tools: {
    createMemoryGetTool: ...;
    createMemorySearchTool: ...;
    registerMemoryCli: ...;
  };
  events: {
    onAgentEvent: ...;
    onSessionTranscriptUpdate: ...;
  };
  logging: {
    shouldLogVerbose: ...;
    getChildLogger: (bindings?: Record<string, unknown>, opts?: { level?: LogLevel }) => RuntimeLogger;
  };
  state: {
    resolveStateDir: ...;
  };
  modelAuth: {
    getApiKeyForModel: (params: { model, cfg? }) => Promise<ResolvedProviderAuth>;
    resolveApiKeyForProvider: (params: { provider, cfg? }) => Promise<ResolvedProviderAuth>;
  };
};
```

## PluginRuntime

Defined in `src/plugins/runtime/types.ts`. Extends `PluginRuntimeCore` with:

```typescript
export type PluginRuntime = PluginRuntimeCore & {
  subagent: {
    run: (params: SubagentRunParams) => Promise<SubagentRunResult>;
    waitForRun: (params: SubagentWaitParams) => Promise<SubagentWaitResult>;
    getSessionMessages: (params) => Promise<SubagentGetSessionMessagesResult>;
    getSession: (params) => Promise<SubagentGetSessionResult>;
    deleteSession: (params) => Promise<void>;
  };
  channel: PluginRuntimeChannel;
};
```

Exported from `src/plugin-sdk/core.ts`.

---

## OpenClawPluginToolContext

Defined in `src/plugins/types.ts`.

```typescript
type OpenClawPluginToolContext = {
  config?: OpenClawConfig;
  workspaceDir?: string;
  agentDir?: string;
  agentId?: string;
  sessionKey?: string;
  sessionId?: string;
  messageChannel?: string;
  agentAccountId?: string;
  requesterSenderId?: string;
  senderIsOwner?: boolean;
  sandboxed?: boolean;
};
```

## OpenClawPluginToolFactory

```typescript
type OpenClawPluginToolFactory = (ctx: OpenClawPluginToolContext) => AnyAgentTool | AnyAgentTool[] | null | undefined;
```

## PluginHookAgentContext

```typescript
type PluginHookAgentContext = {
  agentId?: string;
  sessionKey?: string;
  sessionId?: string;
  workspaceDir?: string;
  messageProvider?: string;
  trigger?: string;
  channelId?: string;
};
```

---

## registerTool — Basic

```ts
api.registerTool({
  name: "my_tool",
  description: "Do a thing",
  parameters: Type.Object({ input: Type.String() }),
  async execute(_id, params) {
    return { content: [{ type: "text", text: params.input }] };
  },
});
```

## registerTool — Factory (per-session context)

Factory form is typed as `OpenClawPluginToolFactory`. Use to access `ctx.agentId`, `ctx.sessionKey`, etc.

```ts
api.registerTool(
  (ctx: OpenClawPluginToolContext) => ({
    name: "my_tool",
    description: "...",
    parameters: Type.Object({ ... }),
    async execute(_id, params) { ... },
  }),
  { name: "my_tool" }
);
```

## registerTool — Optional

```ts
api.registerTool({ name: "...", ... }, { optional: true });
```

## registerChannel

Both forms are valid (`src/plugins/types.ts`):

```ts
api.registerChannel({ plugin: myChannelPlugin });
api.registerChannel(myChannelPlugin);
```

## api.on() — Typed hook registration

`on()` is a formal method on `OpenClawPluginApi`, distinct from `registerHook()`.
Supports ~24 hook points including `before_prompt_build`, `before_tool_call`, `after_tool_call`, `session_start`, `session_end`.

```ts
api.on("before_prompt_build", async (event, ctx) => {
  return { prependContext: "..." };
});
```

---

## Gateway RPC: agents.create

Defined in `src/gateway/server-methods/agents.ts:476-547`.
Schema in `src/gateway/protocol/schema/agents-models-skills.ts:47-55`.

**Parameters** (does NOT support `agentDir` or `bindings`):
```typescript
{
  name: string;       // required
  workspace: string;  // required
  emoji?: string;
  avatar?: string;
}
```

Creates workspace directory only. Does NOT create `agentDir`. Does NOT write bindings.

## Gateway RPC: agents.update

Parameters: `agentId` (required), `name?`, `workspace?`, `model?`, `avatar?`.

## applyAgentConfig()

Defined in `src/commands/agents.config.ts:127-165`.
Handles: `agentId`, `name`, `workspace`, `agentDir`, `model`. Does NOT handle `bindings`.

## Bindings

No dedicated gateway method. Must be written via `config.patch` or `runtime.config.writeConfigFile()`.
Stored in `cfg.bindings[]` array.

---

## Notes

- `runtime.config.loadConfig()` and `runtime.config.writeConfigFile()` are **official public API** in `PluginRuntimeCore`. Safe to use.
- `agents.create` RPC cannot replace direct config writes for this plugin because it lacks `agentDir` and `bindings` support.
- No bundled OpenClaw extensions currently use `runtime.config` to spawn agents dynamically — this plugin is the first to do so.
