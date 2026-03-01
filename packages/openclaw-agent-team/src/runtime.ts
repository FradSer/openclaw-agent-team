import type { PluginRuntime } from "openclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setAgentTeamRuntime(next: PluginRuntime): void {
  runtime = next;
}

export function getAgentTeamRuntime(): PluginRuntime {
  if (!runtime) throw new Error("Agent Team runtime not initialized");
  return runtime;
}

export function resetAgentTeamRuntime(): void {
  runtime = null;
}
