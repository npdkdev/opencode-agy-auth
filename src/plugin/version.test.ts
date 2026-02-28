import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../constants", () => ({
  setAntigravityVersion: vi.fn(),
}))

describe("initAntigravityVersion", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("tries remote fetch before fallback", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("1.20.0", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const { initAntigravityVersion } = await import("./version")
    const { setAntigravityVersion } = await import("../constants")

    await initAntigravityVersion("1.18.3")

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(vi.mocked(setAntigravityVersion)).toHaveBeenCalledWith("1.20.0")
  })

  it("falls back when remote fetch fails", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("network error"))
    vi.stubGlobal("fetch", fetchMock)

    const { initAntigravityVersion } = await import("./version")
    const { setAntigravityVersion } = await import("../constants")

    await initAntigravityVersion("1.18.3")

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(vi.mocked(setAntigravityVersion)).toHaveBeenCalledWith("1.18.3")
  })

  it("caches fetched result and avoids refetching", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("1.20.0", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const { initAntigravityVersion } = await import("./version")

    await initAntigravityVersion("1.18.3")
    await initAntigravityVersion("1.18.3")

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
