import { describe, expect, it } from "vitest"

import { truncateOldToolResponses } from "./request-helpers.ts"

function buildToolTurn(content: unknown): Record<string, unknown> {
  return {
    role: "user",
    parts: [
      {
        functionResponse: {
          id: "tool-1",
          name: "lookup",
          response: {
            content,
          },
        },
      },
    ],
  }
}

describe("truncateOldToolResponses", () => {
  it("truncates old tool responses beyond cutoff", () => {
    const long = "x".repeat(20)
    const contents = [
      buildToolTurn(long),
      buildToolTurn("ok"),
      buildToolTurn("ok"),
      buildToolTurn("recent"),
      buildToolTurn("recent"),
    ]

    const result = truncateOldToolResponses(contents, 8, 2) as Record<string, unknown>[]
    const firstPart = (result[0]?.["parts"] as Record<string, unknown>[])[0]
    const firstResponse = (firstPart?.["functionResponse"] as Record<string, unknown>)["response"] as Record<string, unknown>

    expect(firstResponse["content"]).toBe("xxxxxxxx\n...[truncated 12 chars]")
  })

  it("preserves recent turns fully", () => {
    const long = "y".repeat(20)
    const contents = [
      buildToolTurn("older"),
      buildToolTurn(long),
    ]

    const result = truncateOldToolResponses(contents, 5, 1) as Record<string, unknown>[]
    const recentPart = (result[1]?.["parts"] as Record<string, unknown>[])[0]
    const recentResponse = (recentPart?.["functionResponse"] as Record<string, unknown>)["response"] as Record<string, unknown>

    expect(recentResponse["content"]).toBe(long)
  })

  it("handles short content without truncation", () => {
    const contents = [
      buildToolTurn("short"),
      buildToolTurn("recent"),
    ]

    const result = truncateOldToolResponses(contents, 5, 1) as Record<string, unknown>[]
    const part = (result[0]?.["parts"] as Record<string, unknown>[])[0]
    const response = (part?.["functionResponse"] as Record<string, unknown>)["response"] as Record<string, unknown>

    expect(response["content"]).toBe("short")
  })

  it("handles non-string content gracefully", () => {
    const contents = [
      buildToolTurn({ value: 1 }),
      buildToolTurn("recent"),
    ]

    const result = truncateOldToolResponses(contents, 3, 1) as Record<string, unknown>[]
    const part = (result[0]?.["parts"] as Record<string, unknown>[])[0]
    const response = (part?.["functionResponse"] as Record<string, unknown>)["response"] as Record<string, unknown>

    expect(response["content"]).toEqual({ value: 1 })
  })

  it("handles empty and short arrays as no-op", () => {
    const empty: unknown[] = []
    const short = [buildToolTurn("a"), buildToolTurn("b"), buildToolTurn("c")]

    expect(truncateOldToolResponses(empty, 5, 3)).toBe(empty)
    expect(truncateOldToolResponses(short, 5, 3)).toBe(short)
  })

  it("includes truncated char count in message", () => {
    const contents = [
      buildToolTurn("abcdefghij"),
      buildToolTurn("recent"),
    ]

    const result = truncateOldToolResponses(contents, 4, 1) as Record<string, unknown>[]
    const part = (result[0]?.["parts"] as Record<string, unknown>[])[0]
    const response = (part?.["functionResponse"] as Record<string, unknown>)["response"] as Record<string, unknown>

    expect(response["content"]).toBe("abcd\n...[truncated 6 chars]")
  })
})
