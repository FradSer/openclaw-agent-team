import { describe, it, expect } from "vitest";
import { PLUGIN_ID, PLUGIN_NAME } from "../src/index.js";

describe("Package Setup", () => {
  it("should export PLUGIN_ID", () => {
    expect(PLUGIN_ID).toBe("openclaw-agent-team");
  });

  it("should export PLUGIN_NAME", () => {
    expect(PLUGIN_NAME).toBe("Agent Team");
  });

  it("should have valid package.json", async () => {
    const pkg = await import("../package.json", { with: { type: "json" } });
    expect(pkg.default.name).toBe("@fradser/openclaw-agent-team");
    expect(pkg.default.type).toBe("module");
  });
});
