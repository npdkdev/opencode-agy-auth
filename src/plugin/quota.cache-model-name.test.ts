import { afterEach, describe, expect, it, vi } from "vitest"
import type { PluginClient } from "./types"
import { checkAccountsQuota } from "./quota"

vi.mock("./token", () => ({
  refreshAccessToken: vi.fn(async (auth: { refresh: string }) => ({
    ...auth,
    access: "access-token",
    expires: Date.now() + 60_000,
  })),
}))

vi.mock("./project", () => ({
  ensureProjectContext: vi.fn(async (auth: { access?: string }) => ({
    auth,
    effectiveProjectId: "test-project",
  })),
}))

describe("quota cache model naming", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it("prefers concrete entry.modelName when API key is family name", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        models: {
          "gemini-pro": {
            modelName: "gemini-3-flash",
            displayName: "Gemini 3 Flash",
            quotaInfo: {
              remainingFraction: 0.9,
              resetTime: "2026-03-01T00:00:00Z",
            },
          },
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ buckets: [] }), { status: 200 }))

    vi.stubGlobal("fetch", fetchMock)

    const results = await checkAccountsQuota([
      {
        refreshToken: "rtok",
        addedAt: Date.now(),
        lastUsed: 0,
        enabled: true,
      },
    ], {} as PluginClient)

    expect(results[0]?.status).toBe("ok")
    expect(results[0]?.quota?.groups["gemini-pro"]?.[0]?.model).toBe("gemini-3-flash")
    expect(results[0]?.quota?.groups["gemini-pro"]?.[0]?.displayName).toBe("Gemini 3 Flash")
  })

  it("falls back to API key when modelName is unavailable", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        models: {
          "gemini-3.1-pro": {
            displayName: "Gemini 3.1 Pro",
            quotaInfo: {
              remainingFraction: 0.7,
            },
          },
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ buckets: [] }), { status: 200 }))

    vi.stubGlobal("fetch", fetchMock)

    const results = await checkAccountsQuota([
      {
        refreshToken: "rtok",
        addedAt: Date.now(),
        lastUsed: 0,
        enabled: true,
      },
    ], {} as PluginClient)

    expect(results[0]?.status).toBe("ok")
    expect(results[0]?.quota?.groups["gemini-pro"]?.[0]?.model).toBe("gemini-3.1-pro")
    expect(results[0]?.quota?.groups["gemini-pro"]?.[0]?.displayName).toBe("Gemini 3.1 Pro")
  })
})
