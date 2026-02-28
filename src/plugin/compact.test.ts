import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

type CreateContextOverflowSyntheticResponse = (input: {
  client: unknown;
  directory: string;
  sessionId?: string;
  requestedModel?: string;
  effectiveModel?: string;
}) => Promise<Response>;

let createContextOverflowSyntheticResponse:
  | CreateContextOverflowSyntheticResponse
  | undefined;

beforeAll(async () => {
  vi.mock("@opencode-ai/plugin", () => ({
    tool: vi.fn(),
  }));

  const { __testExports } = await import("../plugin");
  createContextOverflowSyntheticResponse = (__testExports as unknown as {
    createContextOverflowSyntheticResponse?: CreateContextOverflowSyntheticResponse;
  }).createContextOverflowSyntheticResponse;
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("context overflow auto-compact", () => {
  it("awaits compact and returns success message when compact resolves", async () => {
    let resolveCompact: (() => void) | undefined;
    const command = vi.fn(
      () =>
        new Promise<unknown>((resolve) => {
          resolveCompact = () => resolve(undefined);
        }),
    );
    const client = { session: { command } };

    let settled = false;
    const responsePromise = createContextOverflowSyntheticResponse?.({
      client,
      directory: "/tmp/project",
      sessionId: "ses-123",
      requestedModel: "claude-sonnet-4-6-thinking",
    });
    responsePromise?.then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(command).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);

    resolveCompact?.();
    const response = await responsePromise;
    const text = await response?.text();
    expect(text).toContain("has been automatically compacted");
    expect(text).toContain("resend your last message");
  });

  it("returns failure message when compact command times out", async () => {
    vi.useFakeTimers();
    const command = vi.fn(() => new Promise<unknown>(() => {}));
    const client = { session: { command } };

    const responsePromise = createContextOverflowSyntheticResponse?.({
      client,
      directory: "/tmp/project",
      sessionId: "ses-123",
      effectiveModel: "claude-opus-4-6-thinking",
    });

    await vi.advanceTimersByTimeAsync(15_000);
    const response = await responsePromise;
    const text = await response?.text();

    expect(command).toHaveBeenCalledTimes(1);
    expect(text).toContain("auto-compact failed");
    expect(text).toContain("run **/compact** manually");
  });

  it("falls back to manual compact message when session ID is missing", async () => {
    const command = vi.fn().mockResolvedValue(undefined);
    const client = { session: { command } };

    const response = await createContextOverflowSyntheticResponse?.({
      client,
      directory: "/tmp/project",
      effectiveModel: "claude-sonnet-4-6-thinking",
    });
    const text = await response?.text();

    expect(command).not.toHaveBeenCalled();
    expect(text).toContain(
      "Context was too long. Please run /compact manually, then resend your message.",
    );
  });
});
