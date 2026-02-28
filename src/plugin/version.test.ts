import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const VERSION_URL = "https://antigravity-auto-updater-974169037036.us-central1.run.app"
const CHANGELOG_URL = "https://antigravity.google/changelog"

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
    expect(fetchMock.mock.calls[0]?.[0]).toBe(VERSION_URL)
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
    expect(fetchMock.mock.calls[0]?.[0]).toBe(VERSION_URL)
    expect(fetchMock.mock.calls[1]?.[0]).toBe(CHANGELOG_URL)
    expect(vi.mocked(setAntigravityVersion)).toHaveBeenCalledWith("1.18.3")
  })

  it("uses changelog version when updater response has no semver", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("Auto updater is running", { status: 200 }))
      .mockResolvedValueOnce(new Response("Latest release is 1.21.0", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const { initAntigravityVersion } = await import("./version")
    const { setAntigravityVersion } = await import("../constants")

    await initAntigravityVersion("1.18.3")

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(VERSION_URL)
    expect(fetchMock.mock.calls[1]?.[0]).toBe(CHANGELOG_URL)
    expect(vi.mocked(setAntigravityVersion)).toHaveBeenCalledWith("1.21.0")
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
    expect(fetchMock.mock.calls[0]?.[0]).toBe(VERSION_URL)
  })
})
