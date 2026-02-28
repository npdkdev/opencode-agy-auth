import { describe, expect, it } from "vitest"

import { filterThinkingFromHistory } from "./request-helpers"

describe("filterThinkingFromHistory", () => {
  it("strips all thinking parts when keepThinking=false (Gemini-style thought:true)", () => {
    const contents = [
      {
        role: "model",
        parts: [
          { thought: true, text: "internal", thoughtSignature: "sig-1" },
          { text: "visible" },
        ],
      },
    ]

    const result = filterThinkingFromHistory(contents, false)

    expect(result).toEqual([
      {
        role: "model",
        parts: [{ text: "visible" }],
      },
    ])
  })

  it("strips Anthropic-style thinking parts when keepThinking=false (type:\"thinking\")", () => {
    const contents = [
      {
        role: "assistant",
        parts: [
          { type: "thinking", thinking: "internal", signature: "sig-2" },
          { type: "text", text: "visible" },
        ],
      },
    ]

    const result = filterThinkingFromHistory(contents, false)

    expect(result).toEqual([
      {
        role: "assistant",
        parts: [{ type: "text", text: "visible" }],
      },
    ])
  })

  it("preserves text, strips signatures when keepThinking=true", () => {
    const contents = [
      {
        role: "model",
        parts: [
          { thought: true, text: "gemini thought", thoughtSignature: "sig-3" },
          { type: "thinking", thinking: "anthropic thought", signature: "sig-4", thoughtSignature: "sig-5" },
        ],
      },
    ]

    const result = filterThinkingFromHistory(contents, true)

    expect(result).toEqual([
      {
        role: "model",
        parts: [
          { thought: true, text: "gemini thought" },
          { type: "thinking", thinking: "anthropic thought" },
        ],
      },
    ])
  })

  it("strips thoughtSignature from functionCall parts (non-thinking parts)", () => {
    const contents = [
      {
        role: "model",
        parts: [
          {
            functionCall: { name: "lookup", args: { q: "hello" } },
            thoughtSignature: "sig-6",
          },
        ],
      },
    ]

    const result = filterThinkingFromHistory(contents, false)

    expect(result).toEqual([
      {
        role: "model",
        parts: [
          {
            functionCall: { name: "lookup", args: { q: "hello" } },
          },
        ],
      },
    ])
  })

  it("removes empty turns after filtering (turn with only thinking parts -> turn removed)", () => {
    const contents = [
      {
        role: "model",
        parts: [{ thought: true, text: "only thought", thoughtSignature: "sig-7" }],
      },
      {
        role: "user",
        parts: [{ text: "hello" }],
      },
    ]

    const result = filterThinkingFromHistory(contents, false)

    expect(result).toEqual([
      {
        role: "user",
        parts: [{ text: "hello" }],
      },
    ])
  })

  it("preserves non-thinking content intact (text parts unchanged)", () => {
    const contents = [
      {
        role: "user",
        parts: [
          { text: "question" },
          { inlineData: { mimeType: "text/plain", data: "abc" } },
        ],
      },
    ]

    const result = filterThinkingFromHistory(contents, false)

    expect(result).toEqual(contents)
  })
})
