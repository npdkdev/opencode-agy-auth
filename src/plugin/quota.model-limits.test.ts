import { afterEach, describe, expect, it } from "vitest";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { discoverAndPersistModelLimits, readModelLimits } from "./quota";

const tempPaths: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "quota-model-limits-"));
  tempPaths.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempPaths.splice(0).map(async (entry) => {
    await fs.rm(entry, { recursive: true, force: true });
  }));
});

describe("quota model limits", () => {
  it("readModelLimits returns defaults when file doesn't exist", async () => {
    const configDir = path.join(os.tmpdir(), `quota-model-limits-missing-${Date.now()}-${Math.random()}`);
    const modelLimits = await readModelLimits(configDir);

    expect(modelLimits).toEqual({
      claude_context_limit: 200000,
      claude_thinking_budget_max: 1024,
      gemini_context_limit: 1000000,
    });
  });

  it("readModelLimits reads existing values from antigravity.json", async () => {
    const configDir = await createTempDir();
    const configPath = path.join(configDir, "antigravity.json");
    await fs.writeFile(configPath, JSON.stringify({
      model_limits: {
        claude_context_limit: 102385,
        claude_thinking_budget_max: 8192,
        gemini_context_limit: 1048576,
        last_discovered_at: "2026-02-27T00:00:00.000Z",
      },
    }), "utf-8");

    const modelLimits = await readModelLimits(configDir);

    expect(modelLimits).toEqual({
      claude_context_limit: 102385,
      claude_thinking_budget_max: 8192,
      gemini_context_limit: 1048576,
      last_discovered_at: "2026-02-27T00:00:00.000Z",
    });
  });

  it("discoverAndPersistModelLimits writes to file when limits change", async () => {
    const configDir = await createTempDir();
    const configPath = path.join(configDir, "antigravity.json");
    const quotaModels = new Map<string, { inputTokenLimit?: number; thinkingBudgetMax?: number }>([
      ["antigravity-claude-sonnet-4-6-thinking", { inputTokenLimit: 102385, thinkingBudgetMax: 8192 }],
      ["antigravity-gemini-3.1-pro", { inputTokenLimit: 1048576 }],
    ]);

    await discoverAndPersistModelLimits(configDir, quotaModels);

    const raw = await fs.readFile(configPath, "utf-8");
    const parsed = JSON.parse(raw) as { model_limits?: Record<string, unknown> };
    expect(parsed.model_limits).toBeDefined();
    expect(parsed.model_limits).toMatchObject({
      claude_context_limit: 102385,
      claude_thinking_budget_max: 8192,
      gemini_context_limit: 1048576,
    });
    expect(typeof parsed.model_limits?.last_discovered_at).toBe("string");
  });

  it("discoverAndPersistModelLimits is no-op when values unchanged", async () => {
    const configDir = await createTempDir();
    const configPath = path.join(configDir, "antigravity.json");
    const existing = {
      model_limits: {
        claude_context_limit: 200000,
        claude_thinking_budget_max: 1024,
        gemini_context_limit: 1000000,
      },
      untouched: true,
    };
    await fs.writeFile(configPath, JSON.stringify(existing, null, 2), "utf-8");
    const before = await fs.readFile(configPath, "utf-8");

    const quotaModels = new Map<string, { inputTokenLimit?: number; thinkingBudgetMax?: number }>([
      ["antigravity-claude-sonnet-4-6-thinking", { inputTokenLimit: 200000, thinkingBudgetMax: 1024 }],
      ["antigravity-gemini-3.1-pro", { inputTokenLimit: 1000000 }],
    ]);
    await discoverAndPersistModelLimits(configDir, quotaModels);

    const after = await fs.readFile(configPath, "utf-8");
    expect(after).toBe(before);
  });

  it("handles write errors gracefully without throwing", async () => {
    const tempDir = await createTempDir();
    const invalidConfigDir = path.join(tempDir, "as-file");
    await fs.writeFile(invalidConfigDir, "x", "utf-8");

    const quotaModels = new Map<string, { inputTokenLimit?: number; thinkingBudgetMax?: number }>([
      ["antigravity-claude-sonnet-4-6-thinking", { inputTokenLimit: 102385, thinkingBudgetMax: 8192 }],
    ]);

    await expect(discoverAndPersistModelLimits(invalidConfigDir, quotaModels)).resolves.toBeUndefined();
  });
});
