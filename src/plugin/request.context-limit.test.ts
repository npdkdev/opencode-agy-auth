import { describe, expect, it } from "vitest";
import type { ModelLimits } from "../constants.ts";
import { prepareAntigravityRequest } from "./request";

const CLAUDE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/claude-sonnet-4-6-thinking:generateContent";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent";

const ACCESS_TOKEN = "test-token";
const PROJECT_ID = "test-project";

function buildInit(textSize: number): RequestInit {
  return {
    method: "POST",
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: "x".repeat(textSize) }],
        },
      ],
    }),
  };
}

function createLimits(overrides: Partial<ModelLimits> = {}): ModelLimits {
  return {
    claude_context_limit: 200_000,
    claude_thinking_budget_max: 32_768,
    gemini_context_limit: 1_000_000,
    ...overrides,
  };
}

async function getOverflowText(response?: Response): Promise<string> {
  if (!response) {
    return "";
  }
  return response.text();
}

describe("prepareAntigravityRequest context limits", () => {
  it("uses claude_context_limit from modelLimits", async () => {
    const result = prepareAntigravityRequest(
      CLAUDE_URL,
      buildInit(900_000),
      ACCESS_TOKEN,
      PROJECT_ID,
      undefined,
      "antigravity",
      false,
      undefined,
      createLimits({ claude_context_limit: 200_000 }),
    );

    const text = await getOverflowText(result.contextOverflowResponse);
    expect(result.contextOverflowResponse).toBeDefined();
    expect(text).toContain("200,000 token limit");
  });

  it("applies effectiveLimit as HARD_LIMIT - thinkingBudget - 5,000", () => {
    const result = prepareAntigravityRequest(
      CLAUDE_URL,
      buildInit(220_000),
      ACCESS_TOKEN,
      PROJECT_ID,
      undefined,
      "antigravity",
      false,
      undefined,
      createLimits({ claude_context_limit: 50_000 }),
    );

    expect(result.contextOverflowResponse).toBeDefined();
  });

  it("computes overBy against HARD_LIMIT without negative overflow", async () => {
    const result = prepareAntigravityRequest(
      CLAUDE_URL,
      buildInit(900_000),
      ACCESS_TOKEN,
      PROJECT_ID,
      undefined,
      "antigravity",
      false,
      undefined,
      createLimits({ claude_context_limit: 200_000 }),
    );

    const text = await getOverflowText(result.contextOverflowResponse);
    expect(result.contextOverflowResponse).toBeDefined();
    expect(text).not.toContain("~-");
  });

  it("does not apply Claude overflow guard to Gemini requests", () => {
    const result = prepareAntigravityRequest(
      GEMINI_URL,
      buildInit(460_000),
      ACCESS_TOKEN,
      PROJECT_ID,
      undefined,
      "antigravity",
      false,
      undefined,
      createLimits({ gemini_context_limit: 50_000 }),
    );

    expect(result.contextOverflowResponse).toBeUndefined();
  });
});
