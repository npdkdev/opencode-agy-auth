import { describe, it, expect } from "vitest";
import { ANSI } from "./ansi";

function formatRelativeTime(timestamp: number | undefined): string {
  if (!timestamp) return "never";
  const days = Math.floor((Date.now() - timestamp) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(timestamp).toLocaleDateString();
}

function formatDate(timestamp: number | undefined): string {
  if (!timestamp) return "unknown";
  return new Date(timestamp).toLocaleDateString();
}

type AccountStatus = "active" | "rate-limited" | "expired" | "unknown";

function formatCountdown(ms: number): string {
  if (ms <= 0) return "now";
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0 && minutes > 0) return `${hours}h${minutes}m`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${totalSeconds}s`;
}

function formatRateLimitBadge(
  families?: string[],
  resetIn?: Record<string, number>,
): string {
  if (!families || families.length === 0) {
    return `${ANSI.yellow}[rate-limited]${ANSI.reset}`;
  }
  const parts = families.sort().map((f) => {
    const remaining = resetIn?.[f];
    return remaining ? `${f} resets in ${formatCountdown(remaining)}` : f;
  });
  return `${ANSI.yellow}[rate-limited: ${parts.join(", ")}]${ANSI.reset}`;
}

function getStatusBadge(
  status: AccountStatus | undefined,
  rateLimitedFamilies?: string[],
  rateLimitResetIn?: Record<string, number>,
): string {
  switch (status) {
    case "active": {
      const badge = `${ANSI.green}[active]${ANSI.reset}`;
      if (rateLimitedFamilies && rateLimitedFamilies.length > 0) {
        const limited = rateLimitedFamilies
          .sort()
          .map((f) => {
            const remaining = rateLimitResetIn?.[f];
            const countdown = remaining
              ? `, resets in ${formatCountdown(remaining)}`
              : "";
            return `${ANSI.yellow}[${f}: limited${countdown}]${ANSI.reset}`;
          })
          .join(" ");
        return `${badge} ${limited}`;
      }
      return badge;
    }
    case "rate-limited":
      return formatRateLimitBadge(rateLimitedFamilies, rateLimitResetIn);
    case "expired":
      return `${ANSI.red}[expired]${ANSI.reset}`;
    default:
      return "";
  }
}

describe("auth-menu helpers", () => {
  describe("formatRelativeTime", () => {
    it('returns "never" for undefined', () => {
      expect(formatRelativeTime(undefined)).toBe("never");
    });

    it('returns "today" for same day', () => {
      expect(formatRelativeTime(Date.now())).toBe("today");
      expect(formatRelativeTime(Date.now() - 1000)).toBe("today");
    });

    it('returns "yesterday" for 1 day ago', () => {
      const yesterday = Date.now() - 86400000;
      expect(formatRelativeTime(yesterday)).toBe("yesterday");
    });

    it('returns "Xd ago" for 2-6 days', () => {
      expect(formatRelativeTime(Date.now() - 2 * 86400000)).toBe("2d ago");
      expect(formatRelativeTime(Date.now() - 6 * 86400000)).toBe("6d ago");
    });

    it('returns "Xw ago" for 7-29 days', () => {
      expect(formatRelativeTime(Date.now() - 7 * 86400000)).toBe("1w ago");
      expect(formatRelativeTime(Date.now() - 14 * 86400000)).toBe("2w ago");
      expect(formatRelativeTime(Date.now() - 28 * 86400000)).toBe("4w ago");
    });

    it("returns formatted date for 30+ days", () => {
      const oldDate = Date.now() - 60 * 86400000;
      const result = formatRelativeTime(oldDate);
      expect(result).not.toBe("never");
      expect(result).not.toContain("ago");
    });
  });

  describe("formatDate", () => {
    it('returns "unknown" for undefined', () => {
      expect(formatDate(undefined)).toBe("unknown");
    });

    it("returns formatted date for valid timestamp", () => {
      const result = formatDate(Date.now());
      expect(result).not.toBe("unknown");
      expect(typeof result).toBe("string");
    });
  });

  describe("formatCountdown", () => {
    it('returns "now" for zero or negative', () => {
      expect(formatCountdown(0)).toBe("now");
      expect(formatCountdown(-1000)).toBe("now");
    });

    it("returns seconds for < 1 minute", () => {
      expect(formatCountdown(30000)).toBe("30s");
      expect(formatCountdown(1000)).toBe("1s");
    });

    it("returns minutes for < 1 hour", () => {
      expect(formatCountdown(60000)).toBe("1m");
      expect(formatCountdown(5 * 60 * 1000)).toBe("5m");
      expect(formatCountdown(59 * 60 * 1000)).toBe("59m");
    });

    it("returns hours only when no minutes", () => {
      expect(formatCountdown(3600000)).toBe("1h");
      expect(formatCountdown(2 * 3600000)).toBe("2h");
    });

    it("returns hours and minutes combined", () => {
      expect(formatCountdown(2 * 3600000 + 30 * 60 * 1000)).toBe("2h30m");
      expect(formatCountdown(1 * 3600000 + 15 * 60 * 1000)).toBe("1h15m");
    });
  });

  describe("getStatusBadge", () => {
    it("returns green badge for active status without limitations", () => {
      const badge = getStatusBadge("active");
      expect(badge).toContain("[active]");
      expect(badge).toContain(ANSI.green);
      expect(badge).not.toContain("limited");
    });

    it("returns active + claude annotation with countdown", () => {
      const badge = getStatusBadge("active", ["claude"], {
        claude: 2 * 3600000 + 30 * 60 * 1000,
      });
      expect(badge).toContain("[active]");
      expect(badge).toContain("[claude: limited, resets in 2h30m]");
      expect(badge).toContain(ANSI.green);
      expect(badge).toContain(ANSI.yellow);
    });

    it("returns active + gemini annotation with countdown", () => {
      const badge = getStatusBadge("active", ["gemini"], {
        gemini: 45 * 60 * 1000,
      });
      expect(badge).toContain("[active]");
      expect(badge).toContain("[gemini: limited, resets in 45m]");
    });

    it("returns active + annotation without countdown when resetIn missing", () => {
      const badge = getStatusBadge("active", ["claude"]);
      expect(badge).toContain("[active]");
      expect(badge).toContain("[claude: limited]");
      expect(badge).not.toContain("resets in");
    });

    it("returns rate-limited with countdown when both exhausted", () => {
      const badge = getStatusBadge("rate-limited", ["claude", "gemini"], {
        claude: 1800000,
        gemini: 3600000,
      });
      expect(badge).toContain("[rate-limited:");
      expect(badge).toContain("claude resets in 30m");
      expect(badge).toContain("gemini resets in 1h");
    });

    it("returns generic rate-limited without families", () => {
      const badge = getStatusBadge("rate-limited");
      expect(badge).toContain("[rate-limited]");
      expect(badge).not.toContain(":");
    });

    it("sorts families alphabetically", () => {
      const badge = getStatusBadge("active", ["gemini", "claude"], {
        gemini: 60000,
        claude: 120000,
      });
      const claudeIdx = badge.indexOf("[claude:");
      const geminiIdx = badge.indexOf("[gemini:");
      expect(claudeIdx).toBeLessThan(geminiIdx);
    });

    it("returns red badge for expired status", () => {
      const badge = getStatusBadge("expired");
      expect(badge).toContain("[expired]");
      expect(badge).toContain(ANSI.red);
    });

    it("returns empty string for unknown status", () => {
      expect(getStatusBadge("unknown")).toBe("");
      expect(getStatusBadge(undefined)).toBe("");
    });
  });

  describe("formatRateLimitBadge", () => {
    it("returns generic badge for empty families", () => {
      const badge = formatRateLimitBadge([]);
      expect(badge).toContain("[rate-limited]");
      expect(badge).not.toContain(":");
    });

    it("returns generic badge for undefined families", () => {
      const badge = formatRateLimitBadge(undefined);
      expect(badge).toContain("[rate-limited]");
      expect(badge).not.toContain(":");
    });

    it("returns detailed badge with countdown", () => {
      const badge = formatRateLimitBadge(["claude"], { claude: 5400000 });
      expect(badge).toContain("[rate-limited: claude resets in 1h30m]");
    });

    it("returns detailed badge without countdown when resetIn missing", () => {
      const badge = formatRateLimitBadge(["claude"]);
      expect(badge).toContain("[rate-limited: claude]");
      expect(badge).not.toContain("resets in");
    });

    it("returns detailed badge for multiple families sorted with countdowns", () => {
      const badge = formatRateLimitBadge(["gemini", "claude"], {
        gemini: 3600000,
        claude: 1800000,
      });
      expect(badge).toContain("claude resets in 30m");
      expect(badge).toContain("gemini resets in 1h");
    });
  });
});
