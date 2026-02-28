import { describe, expect, it } from "vitest"

import { normalizeThinkingConfig } from "./request-helpers"
import { resolveEffectiveThinkingBudget } from "./quota"

describe("normalizeThinkingConfig thinkingBudget handling", () => {
  it("keeps thinkingBudget -1 as enabled thinking", () => {
    const normalized = normalizeThinkingConfig({ thinkingBudget: -1 })

    expect(normalized).toBeDefined()
    expect(normalized).toEqual({
      thinkingBudget: -1,
      includeThoughts: false,
    })
  })

  it("keeps positive thinking budgets", () => {
    const normalized = normalizeThinkingConfig({ thinkingBudget: 8192 })

    expect(normalized).toBeDefined()
    expect(normalized).toEqual({
      thinkingBudget: 8192,
      includeThoughts: false,
    })
  })

  it("disables thinking for zero or negative non--1 budgets", () => {
    expect(normalizeThinkingConfig({ thinkingBudget: 0 })).toBeUndefined()
    expect(normalizeThinkingConfig({ thinkingBudget: -2 })).toBeUndefined()
  })
})

describe("resolveEffectiveThinkingBudget", () => {
  it("returns -1 for server-controlled thinking", () => {
    expect(resolveEffectiveThinkingBudget(-1, undefined, 1024)).toBe(-1)
  })

  it("uses variantBudget when provided", () => {
    expect(resolveEffectiveThinkingBudget(512, 8192, 1024)).toBe(8192)
  })

  it("uses serverBudget as fallback", () => {
    expect(resolveEffectiveThinkingBudget(4096, undefined, 1024)).toBe(4096)
  })
})
