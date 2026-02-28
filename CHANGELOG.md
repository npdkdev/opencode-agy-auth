# Changelog

## [2.1.0] - 2026-03-01

### Added

- Added `claude_prompt_auto_caching` config support (file/env) to auto-inject `cache_control: { type: "ephemeral" }` for Claude prompt blocks.
- Added `debug_log_retention_days` config support and startup cleanup for old debug log files.

### Changed

- Stripped `x-goog-user-project` consistently across Antigravity and Gemini CLI request styles to avoid project-header permission conflicts.
- Added request payload sanitization for invalid/empty `contents[].parts` and `systemInstruction.parts` before forwarding.
- Hardened non-streaming response transform fallback with clone-safe body reads to avoid consumed-body failures.
- Synced config documentation keys across `src/plugin/config/schema.ts` and `assets/antigravity.schema.json` (including `debug_tui` and `model_limits`).

## [2.0.0] - 2026-02-28

### Base

- Version line is reset above upstream `opencode-antigravity-auth` `v1.6.5-beta.0`.
- Project is published as `opencode-agy-auth` with fresh standalone repository history.

### Improvements Compared to Upstream `v1.6.5-beta.0`

- Added history-level thinking filtering via `filterThinkingFromHistory()` to sanitize `thoughtSignature` payloads in mixed part types (`src/plugin/request-helpers.ts`, `src/plugin/request-helpers.filter-thinking.test.ts`).
- Added context truncation and token-pressure controls for request history (`src/plugin/request-helpers.truncation.test.ts`, `src/plugin/request.context-limit.test.ts`).
- Added explicit thinking-recovery and variant-budget regression coverage (`src/plugin/request.thinking-recovery.test.ts`, `src/plugin/request.variant-budget.test.ts`).
- Added model-capacity exhaustion handling regression suite (`src/plugin/capacity-exhausted.test.ts`).
- Added model-limit validation coverage for quota behavior (`src/plugin/quota.model-limits.test.ts`).
- Expanded platform support validation with Linux-oriented runtime checks (`src/plugin/platform.test.ts`, `src/constants.ts`).
- Added environment-aware config loading coverage for safer runtime configuration (`src/plugin/config/loader-env.test.ts`).
