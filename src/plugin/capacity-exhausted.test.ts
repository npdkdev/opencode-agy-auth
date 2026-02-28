import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import {
  ANTIGRAVITY_ENDPOINT_FALLBACKS,
  ANTIGRAVITY_PROVIDER_ID,
} from "../constants"

const state = vi.hoisted(() => {
  return {
    manager: null as Record<string, unknown> | null,
    prepareEndpoints: [] as string[],
  }
})

vi.mock("@opencode-ai/plugin", () => {
  const chain = {
    describe: () => chain,
    optional: () => chain,
    default: () => chain,
  }

  const toolFn = Object.assign(
    vi.fn((definition: unknown) => definition),
    {
      schema: {
        string: () => chain,
        array: () => chain,
        boolean: () => chain,
      },
    },
  )

  return { tool: toolFn }
})

vi.mock("./config", async () => {
  const actual = await vi.importActual<typeof import("./config")>("./config")

  return {
    ...actual,
    loadConfig: vi.fn(() => ({
      quiet_mode: true,
      toast_scope: "all",
      keep_thinking: false,
      auto_update: false,
      health_score: undefined,
      token_bucket: undefined,
      proactive_token_refresh: false,
      proactive_refresh_buffer_seconds: 300,
      proactive_refresh_check_interval_seconds: 300,
      account_selection_strategy: "sticky",
      pid_offset_enabled: false,
      soft_quota_threshold_percent: 90,
      soft_quota_cache_ttl_minutes: "auto",
      quota_refresh_interval_minutes: 15,
      max_rate_limit_wait_seconds: 300,
      request_jitter_max_ms: 0,
      default_retry_after_seconds: 1,
      max_backoff_seconds: 1,
      empty_response_max_attempts: 1,
      empty_response_retry_delay_ms: 1,
      claude_tool_hardening: false,
      resume_text: "continue",
      auto_resume: false,
      session_recovery: false,
      scheduling_mode: "cache_first",
      max_cache_first_wait_seconds: 60,
      failure_ttl_seconds: 3600,
    })),
    initRuntimeConfig: vi.fn(),
  }
})

vi.mock("./version", () => ({
  initAntigravityVersion: vi.fn(async () => undefined),
}))

vi.mock("./project", () => ({
  ensureProjectContext: vi.fn(async (auth: unknown) => ({
    auth,
    effectiveProjectId: "project-test",
  })),
}))

vi.mock("./storage", () => ({
  clearAccounts: vi.fn(async () => undefined),
  loadAccounts: vi.fn(async () => null),
  saveAccounts: vi.fn(async () => undefined),
  saveAccountsReplace: vi.fn(async () => undefined),
}))

vi.mock("./rotation", () => ({
  initHealthTracker: vi.fn(),
  getHealthTracker: vi.fn(() => ({
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
    recordRateLimit: vi.fn(),
  })),
  initTokenTracker: vi.fn(),
  getTokenTracker: vi.fn(() => ({
    consume: vi.fn(() => false),
    refund: vi.fn(),
  })),
}))

vi.mock("./logger", () => ({
  initLogger: vi.fn(),
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}))

vi.mock("./debug", () => ({
  startAntigravityDebugRequest: vi.fn(() => ({ id: "debug" })),
  logAntigravityDebugResponse: vi.fn(),
  logAccountContext: vi.fn(),
  logRateLimitEvent: vi.fn(),
  logRateLimitSnapshot: vi.fn(),
  logResponseBody: vi.fn(async () => undefined),
  logModelFamily: vi.fn(),
  isDebugEnabled: vi.fn(() => false),
  getLogFilePath: vi.fn(() => undefined),
  initializeDebug: vi.fn(),
}))

vi.mock("./quota", async () => {
  const actual = await vi.importActual<typeof import("./quota")>("./quota")

  return {
    ...actual,
    checkAccountsQuota: vi.fn(async () => []),
    readModelLimits: vi.fn(async () => null),
  }
})

vi.mock("./recovery", () => ({
  createSessionRecoveryHook: vi.fn(() => null),
  getRecoverySuccessToast: vi.fn(() => ({
    title: "ok",
    message: "ok",
  })),
}))

vi.mock("../hooks/auto-update-checker", () => ({
  createAutoUpdateCheckerHook: vi.fn(() => ({
    event: vi.fn(async () => undefined),
  })),
}))

vi.mock("./search", () => ({
  executeSearch: vi.fn(async () => ""),
}))

vi.mock("./accounts", async () => {
  const actual = await vi.importActual<typeof import("./accounts")>("./accounts")

  class MockAccountManager {
    static async loadFromDisk() {
      return state.manager
    }
  }

  return {
    ...actual,
    AccountManager: MockAccountManager,
  }
})

vi.mock("./request", async () => {
  const actual = await vi.importActual<typeof import("./request")>("./request")

  return {
    ...actual,
    buildThinkingWarmupBody: vi.fn(() => null),
    isGenerativeLanguageRequest: vi.fn(() => true),
    prepareAntigravityRequest: vi.fn(
      (
        input: RequestInfo,
        init: RequestInit | undefined,
        _accessToken: string,
        projectId: string,
        endpoint: string,
      ) => {
        state.prepareEndpoints.push(endpoint)

        return {
          request: new Request(typeof input === "string" ? input : input.toString()),
          init: {
            method: init?.method ?? "POST",
            body: init?.body,
            headers: init?.headers,
            signal: init?.signal,
          },
          streaming: false,
          projectId,
          endpoint,
          requestedModel: "claude-sonnet-4-6-thinking",
          effectiveModel: "claude-sonnet-4-6-thinking",
          sessionId: "session-1",
          toolDebugMissing: 0,
          toolDebugSummary: "",
          toolDebugPayload: "",
          contextOverflowResponse: null,
          needsSignedThinkingWarmup: false,
        }
      },
    ),
    transformAntigravityResponse: vi.fn(async (response: Response) => response),
  }
})

function createMockManager(auth: { refresh: string; access: string; expires: number }) {
  const account = {
    index: 0,
    email: "test@example.com",
    enabled: true,
    cachedQuotaUpdatedAt: Date.now(),
    consecutiveFailures: 0,
    rateLimitResetTimes: {},
  }

  return {
    getAccountCount: vi.fn(() => 1),
    requestSaveToDisk: vi.fn(),
    isRateLimitedForHeaderStyle: vi.fn(() => false),
    hasOtherAccountWithAntigravityAvailable: vi.fn(() => false),
    getAvailableHeaderStyle: vi.fn(() => null),
    getCurrentOrNextForFamily: vi.fn(() => account),
    areAllAccountsOverSoftQuota: vi.fn(() => false),
    getMinWaitTimeForFamily: vi.fn(() => 1000),
    getAccounts: vi.fn(() => [account]),
    getAccountsForQuotaCheck: vi.fn(() => [account]),
    updateQuotaCache: vi.fn(),
    markAccountUsed: vi.fn(),
    shouldShowAccountToast: vi.fn(() => false),
    markToastShown: vi.fn(),
    toAuthDetails: vi.fn(() => auth),
    updateFromAuth: vi.fn(),
    saveToDisk: vi.fn(async () => undefined),
    markAccountCoolingDown: vi.fn(),
    markRateLimited: vi.fn(),
    regenerateAccountFingerprint: vi.fn(() => null),
    getAccountsSnapshot: vi.fn(() => []),
    getMinWaitTimeForSoftQuota: vi.fn(() => null),
    removeAccount: vi.fn(() => false),
  }
}

async function createLoaderFetch() {
  const { createAntigravityPlugin } = await import("../plugin")

  const plugin = await createAntigravityPlugin(ANTIGRAVITY_PROVIDER_ID)({
    client: {
      tui: { showToast: vi.fn(async () => undefined) },
      auth: { set: vi.fn(async () => undefined) },
      session: {
        prompt: vi.fn(async () => undefined),
        command: vi.fn(async () => undefined),
      },
    } as never,
    directory: "/tmp/opencode-agy-auth-tests",
  })

  const auth = {
    type: "oauth" as const,
    refresh: "refresh-token|project-test",
    access: "access-token",
    expires: Date.now() + 60 * 60 * 1000,
  }

  state.manager = createMockManager(auth)

  const loaded = await plugin.auth.loader(async () => auth, {})
  return loaded as { fetch: (input: RequestInfo, init?: RequestInit) => Promise<Response> }
}

describe("capacity exhausted fallback behavior", () => {
  beforeAll(() => {
    vi.setConfig({ testTimeout: 30_000 })
  })

  beforeEach(() => {
    vi.useFakeTimers()
    state.prepareEndpoints = []
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it("returns 503 when capacity is exhausted across all endpoints", async () => {
    const expectedCalls = ANTIGRAVITY_ENDPOINT_FALLBACKS.length * 4
    let callCount = 0

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        callCount += 1
        if (callCount > expectedCalls + 1) {
          throw new Error("capacity handling appears to loop indefinitely")
        }

        return new Response(JSON.stringify({ error: { message: "capacity" } }), {
          status: 503,
          headers: { "content-type": "application/json" },
        })
      }),
    )

    const loader = await createLoaderFetch()
    const responsePromise = loader.fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/claude-sonnet-4-6-thinking:generateContent",
      {
        method: "POST",
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "hello" }] }],
        }),
      },
    )

    await vi.runAllTimersAsync()
    const response = await responsePromise

    expect(response.status).toBe(503)
    expect(callCount).toBe(expectedCalls)
  })

  it("continues to next endpoint when capacity retries are exhausted on current endpoint", async () => {
    let callCount = 0

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        callCount += 1

        if (callCount <= 4) {
          return new Response(JSON.stringify({ error: { message: "capacity" } }), {
            status: 503,
            headers: { "content-type": "application/json" },
          })
        }

        return new Response(
          JSON.stringify({
            candidates: [
              { content: { role: "model", parts: [{ text: "ok" }] } },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        )
      }),
    )

    const loader = await createLoaderFetch()
    const responsePromise = loader.fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/claude-sonnet-4-6-thinking:generateContent",
      {
        method: "POST",
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "hello" }] }],
        }),
      },
    )

    await vi.runAllTimersAsync()
    const response = await responsePromise

    expect(response.status).toBe(200)
    expect(callCount).toBe(5)
    expect(state.prepareEndpoints[0]).toBe(ANTIGRAVITY_ENDPOINT_FALLBACKS[0])
    expect(state.prepareEndpoints[4]).toBe(ANTIGRAVITY_ENDPOINT_FALLBACKS[1])
  })
})
