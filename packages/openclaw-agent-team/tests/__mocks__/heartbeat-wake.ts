/**
 * Mock for OpenClaw's internal heartbeat-wake module.
 * This provides a test double for the requestHeartbeatNow function.
 */

export type HeartbeatRunResult = {
  status: "ran";
  durationMs: number;
} | {
  status: "skipped";
  reason: string;
} | {
  status: "failed";
  reason: string;
};

export type RequestHeartbeatNowOpts = {
  reason?: string;
  coalesceMs?: number;
  agentId?: string;
  sessionKey?: string;
};

// Track calls for testing
const calls: RequestHeartbeatNowOpts[] = [];

export function getRequestHeartbeatNowCalls(): RequestHeartbeatNowOpts[] {
  return [...calls];
}

export function clearRequestHeartbeatNowCalls(): void {
  calls.length = 0;
}

export function requestHeartbeatNow(opts?: RequestHeartbeatNowOpts): void {
  calls.push(opts ?? {});
}

export function setHeartbeatWakeHandler(): () => void {
  return () => {};
}

export function hasHeartbeatWakeHandler(): boolean {
  return true;
}

export function hasPendingHeartbeatWake(): boolean {
  return false;
}

export function resetHeartbeatWakeStateForTests(): void {
  clearRequestHeartbeatNowCalls();
}
