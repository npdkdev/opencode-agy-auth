import { describe, expect, it } from "vitest"
import {
  ANTIGRAVITY_PLATFORM,
  detectPlatformString,
  mapRuntimePlatformToMetadataPlatform,
} from "../constants.ts"
import { PLATFORMS } from "./fingerprint.ts"

describe("platform support", () => {
  it("supports linux metadata platform", () => {
    expect(PLATFORMS).toContain("LINUX")
  })

  it("builds platform string with process.arch", () => {
    expect(ANTIGRAVITY_PLATFORM).toBe(`${process.platform}/${process.arch}`)
    expect(detectPlatformString("linux", "arm64")).toBe("linux/arm64")
  })

  it("maps runtime platform to metadata platform correctly", () => {
    expect(mapRuntimePlatformToMetadataPlatform("darwin")).toBe("MACOS")
    expect(mapRuntimePlatformToMetadataPlatform("win32")).toBe("WINDOWS")
    expect(mapRuntimePlatformToMetadataPlatform("linux")).toBe("LINUX")
    expect(mapRuntimePlatformToMetadataPlatform("freebsd")).toBe("LINUX")
  })
})
