import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { AntigravityConfigSchema, DEFAULT_CONFIG } from "./schema";

describe("cli_first config", () => {
  it("includes cli_first default in DEFAULT_CONFIG", () => {
    expect(DEFAULT_CONFIG).toHaveProperty("cli_first", false);
  });

  it("documents cli_first in the JSON schema", () => {
    const schemaPath = new URL("../../../assets/antigravity.schema.json", import.meta.url);
    const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as {
      properties?: Record<string, { type?: string; default?: unknown; description?: string }>;
    };

    const cliFirst = schema.properties?.cli_first;
    expect(cliFirst).toBeDefined();
    expect(cliFirst).toMatchObject({
      type: "boolean",
      default: false,
    });
    expect(typeof cliFirst?.description).toBe("string");
    expect(cliFirst?.description?.length ?? 0).toBeGreaterThan(0);
  });
});

describe("new config defaults", () => {
  it("includes claude_prompt_auto_caching and debug_log_retention_days defaults", () => {
    expect(DEFAULT_CONFIG).toHaveProperty("claude_prompt_auto_caching", false);
    expect(DEFAULT_CONFIG).toHaveProperty("debug_log_retention_days", 14);
  });

  it("documents new keys in the JSON schema", () => {
    const schemaPath = new URL("../../../assets/antigravity.schema.json", import.meta.url);
    const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as {
      properties?: Record<string, { type?: string; default?: unknown; description?: string }>;
    };

    const autoCaching = schema.properties?.claude_prompt_auto_caching;
    expect(autoCaching).toBeDefined();
    expect(autoCaching).toMatchObject({
      type: "boolean",
      default: false,
    });

    const retention = schema.properties?.debug_log_retention_days;
    expect(retention).toBeDefined();
    expect(retention).toMatchObject({
      type: "number",
      default: 14,
    });
  });

  it("documents debug_tui in the JSON schema", () => {
    const schemaPath = new URL("../../../assets/antigravity.schema.json", import.meta.url);
    const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as {
      properties?: Record<string, { type?: string; default?: unknown; description?: string }>;
    };

    const debugTui = schema.properties?.debug_tui;
    expect(debugTui).toBeDefined();
    expect(debugTui).toMatchObject({
      type: "boolean",
      default: false,
    });
  });

  it("accepts model_limits in TS schema and documents it in JSON schema", () => {
    const parsed = AntigravityConfigSchema.parse({
      model_limits: {
        claude_context_limit: 180000,
        claude_thinking_budget_max: 4096,
        gemini_context_limit: 1500000,
      },
    });

    expect(parsed.model_limits).toMatchObject({
      claude_context_limit: 180000,
      claude_thinking_budget_max: 4096,
      gemini_context_limit: 1500000,
    });

    const schemaPath = new URL("../../../assets/antigravity.schema.json", import.meta.url);
    const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as {
      properties?: Record<string, unknown>;
    };

    expect(schema.properties?.model_limits).toBeDefined();
  });
});
