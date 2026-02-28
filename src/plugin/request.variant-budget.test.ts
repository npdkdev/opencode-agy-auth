import { describe, expect, it } from "vitest";
import type { ModelLimits } from "../constants.ts";
import { prepareAntigravityRequest } from "./request";

const ACCESS_TOKEN = "test-token";
const PROJECT_ID = "test-project";
const CLAUDE_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/claude-opus-4-5-thinking:generateContent";
const CLAUDE_LOW_TIER_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/claude-opus-4-5-thinking-low:generateContent";

function createLimits(overrides: Partial<ModelLimits> = {}): ModelLimits {
  return {
    claude_context_limit: 200_000,
    claude_thinking_budget_max: 32_768,
    gemini_context_limit: 1_000_000,
    ...overrides,
  };
}

function extractClaudeThinkingBudget(result: ReturnType<typeof prepareAntigravityRequest>): number | undefined {
  const wrapped = JSON.parse(result.init.body as string) as {
    request?: {
      generationConfig?: {
        thinkingConfig?: {
          thinking_budget?: number;
        };
      };
    };
  };

  return wrapped.request?.generationConfig?.thinkingConfig?.thinking_budget;
}

describe("prepareAntigravityRequest Claude thinking budget priority", () => {
  it("uses variant budget over tier budget", () => {
    const result = prepareAntigravityRequest(
      CLAUDE_LOW_TIER_URL,
      {
        method: "POST",
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Hello" }] }],
          thinkingConfig: { thinkingBudget: 16_384 },
        }),
      },
      ACCESS_TOKEN,
      PROJECT_ID,
      undefined,
      "antigravity",
      false,
      undefined,
      createLimits({ claude_thinking_budget_max: 32_768 }),
    );

    expect(extractClaudeThinkingBudget(result)).toBe(16_384);
  });

  it("caps variant budget to modelLimits.claude_thinking_budget_max", () => {
    const result = prepareAntigravityRequest(
      CLAUDE_LOW_TIER_URL,
      {
        method: "POST",
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Hello" }] }],
          thinkingConfig: { thinkingBudget: 100_000 },
        }),
      },
      ACCESS_TOKEN,
      PROJECT_ID,
      undefined,
      "antigravity",
      false,
      undefined,
      createLimits({ claude_thinking_budget_max: 32_768 }),
    );

    expect(extractClaudeThinkingBudget(result)).toBe(32_768);
  });

  it("uses tier budget when no variant budget is specified", () => {
    const result = prepareAntigravityRequest(
      CLAUDE_LOW_TIER_URL,
      {
        method: "POST",
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Hello" }] }],
        }),
      },
      ACCESS_TOKEN,
      PROJECT_ID,
      undefined,
      "antigravity",
      false,
      undefined,
      createLimits({ claude_thinking_budget_max: 32_768 }),
    );

    expect(extractClaudeThinkingBudget(result)).toBe(8_192);
  });

  it("falls back to normalized thinking budget when no tier is present", () => {
    const result = prepareAntigravityRequest(
      CLAUDE_BASE_URL,
      {
        method: "POST",
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Hello" }] }],
          thinkingConfig: { thinkingBudget: 1_024 },
        }),
      },
      ACCESS_TOKEN,
      PROJECT_ID,
      undefined,
      "antigravity",
      false,
      undefined,
      createLimits({ claude_thinking_budget_max: 32_768 }),
    );

    expect(extractClaudeThinkingBudget(result)).toBe(1_024);
  });
});
