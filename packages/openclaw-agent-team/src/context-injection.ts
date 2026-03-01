import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Mailbox } from "./mailbox.js";
import type { TeamMessage } from "./types.js";

export interface ContextInjectionContext {
  sessionKey: string;
  teamsDir: string;
  teamName: string;
  teammateName: string;
}

export interface ContextInjectionOptions {
  clearAfterRead?: boolean;
  shouldFail?: boolean;
}

export interface HookResult {
  prependContext?: string;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function messageToXml(message: TeamMessage): string {
  const from = escapeXml(message.from);
  const type = escapeXml(message.type);
  const summary = message.summary ? ` summary="${escapeXml(message.summary)}"` : "";
  const content = escapeXml(message.content);

  return `<teammate-message from="${from}" type="${type}"${summary}>${content}</teammate-message>`;
}

function isTeammateSession(ctx: ContextInjectionContext): boolean {
  // Check if sessionKey has "teammate-" prefix
  if (ctx.sessionKey.includes("teammate-")) {
    return true;
  }

  // Check if teamName and teammateName are provided
  if (ctx.teamName && ctx.teammateName) {
    return true;
  }

  return false;
}

export function createContextInjectionHook(
  ctx: ContextInjectionContext,
  options?: ContextInjectionOptions
): () => Promise<HookResult> {
  return async (): Promise<HookResult> => {
    // Check if this is a teammate session
    if (!isTeammateSession(ctx)) {
      return { prependContext: "" };
    }

    const mailbox = new Mailbox(ctx.teamsDir, ctx.teamName);

    // Read messages without clearing first
    const messages = await mailbox.readInbox(ctx.teammateName, { clear: false });

    if (messages.length === 0) {
      return { prependContext: "" };
    }

    // Simulate failure if shouldFail is true
    if (options?.shouldFail) {
      throw new Error("Injection failed");
    }

    // Convert messages to XML
    const xmlParts = messages.map(messageToXml);
    const prependContext = xmlParts.join("\n");

    // Clear inbox after successful read if clearAfterRead is true
    // We truncate the file (write empty content) instead of deleting it
    if (options?.clearAfterRead) {
      const inboxPath = join(
        ctx.teamsDir,
        ctx.teamName,
        "inbox",
        ctx.teammateName,
        "messages.jsonl"
      );
      await writeFile(inboxPath, "");
    }

    return { prependContext };
  };
}
