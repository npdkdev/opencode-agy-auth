import { describe, it, expect } from "vitest";
import { transformAntigravityResponse } from "./request";

describe("transformAntigravityResponse thinking recovery", () => {
  it("returns response with recovery header for thinking_block_order errors", async () => {
    const response = new Response(
      JSON.stringify({
        error: {
          message:
            "messages.2.content: thinking blocks must start with thinking; first block expected",
        },
      }),
      {
        status: 400,
        statusText: "Bad Request",
        headers: {
          "content-type": "application/json",
        },
      },
    );

    const transformed = await transformAntigravityResponse(response, false);

    expect(transformed).toBeInstanceOf(Response);
    expect(transformed.headers.get("x-antigravity-thinking-recovery")).toBe(
      "needed",
    );
    expect(transformed.headers.get("x-antigravity-error-type")).toBe(
      "thinking_block_order",
    );
  });

  it("does not set thinking recovery header for non-thinking errors", async () => {
    const response = new Response(
      JSON.stringify({ error: { message: "quota exceeded" } }),
      {
        status: 400,
        statusText: "Bad Request",
        headers: {
          "content-type": "application/json",
        },
      },
    );

    const transformed = await transformAntigravityResponse(response, false);

    expect(transformed).toBeInstanceOf(Response);
    expect(transformed.headers.get("x-antigravity-thinking-recovery")).toBeNull();
    expect(transformed.headers.get("x-antigravity-error-type")).toBeNull();
  });
});
