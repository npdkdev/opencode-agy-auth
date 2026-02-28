import { describe, expect, it } from "vitest"

import {
  parseContextLimitFromError,
  pruneOldTurns,
} from "./request-helpers.ts"
import {
  getLearnedLimit,
  updateLearnedLimit,
} from "../constants.ts"

function buildTurn(index: number): Record<string, unknown> {
  return {
    role: index % 2 === 0 ? "user" : "model",
    parts: [{ text: `turn-${index}` }],
  }
}

describe("parseContextLimitFromError", () => {
  it("parses max and actual token counts from max/got pattern", () => {
    const parsed = parseContextLimitFromError("Prompt is too long. Max allowed: 200,000 tokens, got: 245,112 tokens")

    expect(parsed).toEqual({
      maxTokens: 200000,
      actualTokens: 245112,
    })
  })

  it("parses actual and max token counts from compare pattern", () => {
    const parsed = parseContextLimitFromError("context length exceeded: 312,500 > 200,000")

    expect(parsed).toEqual({
      maxTokens: 200000,
      actualTokens: 312500,
    })
  })

  it("parses maximum context length pattern", () => {
    const parsed = parseContextLimitFromError("maximum context length is 1,048,576")

    expect(parsed).toEqual({
      maxTokens: 1048576,
    })
  })

  it("parses max and actual from maximum/actual wording", () => {
    const parsed = parseContextLimitFromError("Maximum: 128,000 tokens. Actual: 170,000 tokens")

    expect(parsed).toEqual({
      maxTokens: 128000,
      actualTokens: 170000,
    })
  })

  it("returns null for unrecognized error text", () => {
    expect(parseContextLimitFromError("invalid request payload")).toBeNull()
  })
})

describe("learned context limits", () => {
  it("stores and retrieves a learned limit", () => {
    const family = `claude-test-store-${Date.now()}`

    updateLearnedLimit(family, 200000)

    expect(getLearnedLimit(family)).toBe(200000)
  })

  it("only updates when the new limit is stricter", () => {
    const family = `claude-test-strict-${Date.now()}`

    updateLearnedLimit(family, 200000)
    updateLearnedLimit(family, 220000)
    expect(getLearnedLimit(family)).toBe(200000)

    updateLearnedLimit(family, 180000)
    expect(getLearnedLimit(family)).toBe(180000)
  })
})

describe("pruneOldTurns", () => {
  it("removes older turns when estimated tokens exceed 85% threshold", () => {
    const contents = Array.from({ length: 8 }, (_, idx) => buildTurn(idx))

    const pruned = pruneOldTurns(contents, 1000, 1000)

    expect(pruned.length).toBeLessThan(contents.length)
    expect(pruned[0]).toEqual(contents[0])
  })

  it("is a no-op when estimated tokens are under threshold", () => {
    const contents = Array.from({ length: 8 }, (_, idx) => buildTurn(idx))

    const pruned = pruneOldTurns(contents, 800, 1000)

    expect(pruned).toBe(contents)
  })

  it("preserves first turn and last four turns by default", () => {
    const contents = Array.from({ length: 8 }, (_, idx) => buildTurn(idx))

    const pruned = pruneOldTurns(contents, 1000, 1000)

    expect(pruned[0]).toEqual(contents[0])
    expect(pruned.slice(1)).toEqual(contents.slice(-4))
  })
})
