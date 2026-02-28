import {
  ANTIGRAVITY_ENDPOINT_PROD,
  DEFAULT_CLAUDE_CONTEXT_LIMIT,
  DEFAULT_CLAUDE_THINKING_BUDGET,
  DEFAULT_GEMINI_CONTEXT_LIMIT,
  getAntigravityHeaders,
  getDefaultModelLimits,
  ANTIGRAVITY_PROVIDER_ID,
} from "../constants";
import type { ModelLimits } from "../constants";
import { accessTokenExpired, formatRefreshParts, parseRefreshParts } from "./auth";
import { logQuotaFetch, logQuotaStatus } from "./debug";
import { ensureProjectContext } from "./project";
import { refreshAccessToken } from "./token";
import { getModelFamily } from "./transform/model-resolver";
import type { PluginClient, OAuthAuthDetails } from "./types";
import type { AccountMetadataV3 } from "./storage";

const FETCH_TIMEOUT_MS = 10000;

export type QuotaGroup = "claude" | "gemini-pro" | "gemini-flash";

export interface QuotaModelEntry {
  model: string;
  displayName?: string;
  remainingFraction: number;
  resetTime?: string | number;
}

export interface QuotaSummary {
  groups: Partial<Record<QuotaGroup, QuotaModelEntry[]>>;
  modelCount: number;
  error?: string;
}

// Gemini CLI quota types
export interface GeminiCliQuotaModel {
  modelId: string;
  remainingFraction: number;
  resetTime?: string;
}

export interface GeminiCliQuotaSummary {
  models: GeminiCliQuotaModel[];
  error?: string;
}

interface RetrieveUserQuotaResponse {
  buckets?: {
    remainingAmount?: string;
    remainingFraction?: number;
    resetTime?: string;
    tokenType?: string;
    modelId?: string;
  }[];
}

export type AccountQuotaStatus = "ok" | "disabled" | "error";

export interface AccountQuotaResult {
  index: number;
  email?: string;
  status: AccountQuotaStatus;
  error?: string;
  disabled?: boolean;
  quota?: QuotaSummary;
  geminiCliQuota?: GeminiCliQuotaSummary;
  updatedAccount?: AccountMetadataV3;
}

interface FetchAvailableModelsResponse {
  models?: Record<string, FetchAvailableModelEntry>;
}

interface FetchAvailableModelEntry {
  quotaInfo?: {
    remainingFraction?: number;
    resetTime?: string;
  };
  displayName?: string;
  modelName?: string;
  inputTokenLimit?: number;
  thinkingBudgetMax?: number;
}

function buildAuthFromAccount(account: AccountMetadataV3): OAuthAuthDetails {
  return {
    type: "oauth",
    refresh: formatRefreshParts({
      refreshToken: account.refreshToken,
      projectId: account.projectId,
      managedProjectId: account.managedProjectId,
    }),
    access: undefined,
    expires: undefined,
  };
}

function normalizeRemainingFraction(value: unknown): number {
  // If value is missing or invalid, treat as exhausted (0%)
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function parseResetTime(resetTime?: string | number): number | null {
  if (typeof resetTime === "number") {
    return Number.isFinite(resetTime) ? resetTime : null
  }

  if (!resetTime) return null;
  const timestamp = Date.parse(resetTime);
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  return timestamp;
}

function formatResetTime(resetTime?: string | number): string | undefined {
  if (typeof resetTime === "string") {
    return parseResetTime(resetTime) === null ? undefined : resetTime
  }

  if (typeof resetTime === "number" && Number.isFinite(resetTime)) {
    const date = new Date(resetTime)
    return Number.isFinite(date.getTime()) ? date.toISOString() : undefined
  }

  return undefined
}

function classifyQuotaGroup(modelName: string, displayName?: string): QuotaGroup | null {
  const combined = `${modelName} ${displayName ?? ""}`.toLowerCase();
  if (combined.includes("claude")) {
    return "claude";
  }
  const isGemini3 = combined.includes("gemini-3") || combined.includes("gemini 3");
  if (!isGemini3) {
    return null;
  }
  const family = getModelFamily(modelName);
  return family === "gemini-flash" ? "gemini-flash" : "gemini-pro";
}

const QUOTA_FAMILY_MODEL_NAMES = new Set([
  "claude",
  "gemini",
  "gemini-pro",
  "gemini-flash",
]);

function isConcreteQuotaModelName(modelName: string): boolean {
  const normalized = modelName.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (QUOTA_FAMILY_MODEL_NAMES.has(normalized)) {
    return false;
  }
  return /^[a-z0-9][a-z0-9._-]*$/.test(normalized);
}

function resolveQuotaEntryModelName(modelKey: string, entry: FetchAvailableModelEntry): string {
  const candidates = [entry.modelName, modelKey];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && isConcreteQuotaModelName(candidate)) {
      return candidate;
    }
  }

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return modelKey;
}

export function getGroupMinFraction(entries: QuotaModelEntry[]): number | undefined {
  if (entries.length === 0) {
    return undefined;
  }
  return Math.min(...entries.map((entry) => entry.remainingFraction));
}

export function getGroupEarliestReset(entries: QuotaModelEntry[]): string | undefined {
  if (entries.length === 0) {
    return undefined;
  }

  const getEarliestReset = (quotaEntries: QuotaModelEntry[]): string | undefined => {
    let earliestTime: string | undefined;
    let earliestTimestamp: number | undefined;

    for (const entry of quotaEntries) {
      if (!entry.resetTime) {
        continue;
      }

      const parsedTime = parseResetTime(entry.resetTime);
      if (parsedTime === null) {
        continue;
      }

      if (earliestTimestamp === undefined || parsedTime < earliestTimestamp) {
        earliestTimestamp = parsedTime;
        earliestTime = formatResetTime(entry.resetTime);
      }
    }

    return earliestTime;
  };

  const exhaustedEntries = entries.filter((entry) => entry.remainingFraction <= 0.1);
  if (exhaustedEntries.length > 0) {
    return getEarliestReset(exhaustedEntries);
  }

  return getEarliestReset(entries);
}

function aggregateQuota(models?: Record<string, FetchAvailableModelEntry>): QuotaSummary {
  const groups: Partial<Record<QuotaGroup, QuotaModelEntry[]>> = {};
  if (!models) {
    return { groups, modelCount: 0 };
  }

  let totalCount = 0;
  for (const [modelName, entry] of Object.entries(models)) {
    const group = classifyQuotaGroup(modelName, entry.displayName ?? entry.modelName);
    if (!group) {
      continue;
    }
    const quotaInfo = entry.quotaInfo;
    const remainingFraction = normalizeRemainingFraction(quotaInfo?.remainingFraction);
    const resetTime = quotaInfo?.resetTime;
    const parsedResetTime = parseResetTime(resetTime);

    totalCount += 1;

    if (!groups[group]) {
      groups[group] = [];
    }

    const resolvedModelName = resolveQuotaEntryModelName(modelName, entry);

    const displayName =
      typeof entry.displayName === "string" && entry.displayName.trim().length > 0
        ? entry.displayName.trim()
        : undefined

    groups[group]?.push({
      model: resolvedModelName,
      displayName,
      remainingFraction,
      resetTime: parsedResetTime === null ? undefined : resetTime,
    });
  }

  return { groups, modelCount: totalCount };
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchAvailableModels(
  accessToken: string,
  projectId: string,
): Promise<FetchAvailableModelsResponse> {
  const endpoint = ANTIGRAVITY_ENDPOINT_PROD;
  const quotaUserAgent = getAntigravityHeaders()["User-Agent"] || "antigravity/windows/amd64";
  const errors: string[] = [];

  const body = projectId ? { project: projectId } : {};
  const response = await fetchWithTimeout(`${endpoint}/v1internal:fetchAvailableModels`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "User-Agent": quotaUserAgent,
    },
    body: JSON.stringify(body),
  });

  if (response.ok) {
    return (await response.json()) as FetchAvailableModelsResponse;
  }

  const message = await response.text().catch(() => "");
  const snippet = message.trim().slice(0, 200);
  errors.push(
    `fetchAvailableModels ${response.status} at ${endpoint}${snippet ? `: ${snippet}` : ""}`,
  );

  throw new Error(errors.join("; ") || "fetchAvailableModels failed");
}

async function fetchGeminiCliQuota(
  accessToken: string,
  projectId: string,
): Promise<RetrieveUserQuotaResponse> {
  const endpoint = ANTIGRAVITY_ENDPOINT_PROD;
  // Use Gemini CLI user-agent to get CLI quota buckets (not Antigravity buckets)
  const platform = process.platform || "darwin";
  const arch = process.arch || "arm64";
  const geminiCliUserAgent = `GeminiCLI/1.0.0/gemini-2.5-pro (${platform}; ${arch})`;

  const body = projectId ? { project: projectId } : {};
  
  try {
    const response = await fetchWithTimeout(`${endpoint}/v1internal:retrieveUserQuota`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "User-Agent": geminiCliUserAgent,
      },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      const data = (await response.json()) as RetrieveUserQuotaResponse;
      return data;
    }

    // Non-OK response - return empty buckets
    return { buckets: [] };
  } catch {
    // Network error or timeout - return empty buckets
    return { buckets: [] };
  }
}

function aggregateGeminiCliQuota(response: RetrieveUserQuotaResponse): GeminiCliQuotaSummary {
  const models: GeminiCliQuotaModel[] = [];
  
  if (!response.buckets || response.buckets.length === 0) {
    return { models };
  }

  for (const bucket of response.buckets) {
    if (!bucket.modelId) {
      continue;
    }
    
    // Filter out models we don't care about for Gemini CLI quotas
    // Only show gemini-3-* and gemini-2.5-pro models (the premium ones)
    const modelId = bucket.modelId;
    const isRelevantModel = 
      modelId.startsWith("gemini-3-") || 
      modelId === "gemini-2.5-pro";
    
    if (!isRelevantModel) {
      continue;
    }
    
    models.push({
      modelId: bucket.modelId,
      remainingFraction: normalizeRemainingFraction(bucket.remainingFraction),
      resetTime: bucket.resetTime,
    });
  }

  // Sort by model ID for consistent display
  models.sort((a, b) => a.modelId.localeCompare(b.modelId));

  return { models };
}

function applyAccountUpdates(account: AccountMetadataV3, auth: OAuthAuthDetails): AccountMetadataV3 | undefined {
  const parts = parseRefreshParts(auth.refresh);
  if (!parts.refreshToken) {
    return undefined;
  }

  const updated: AccountMetadataV3 = {
    ...account,
    refreshToken: parts.refreshToken,
    projectId: parts.projectId ?? account.projectId,
    managedProjectId: parts.managedProjectId ?? account.managedProjectId,
  };

  const changed =
    updated.refreshToken !== account.refreshToken ||
    updated.projectId !== account.projectId ||
    updated.managedProjectId !== account.managedProjectId;

  return changed ? updated : undefined;
}

export async function checkAccountsQuota(
  accounts: AccountMetadataV3[],
  client: PluginClient,
  providerId = ANTIGRAVITY_PROVIDER_ID,
): Promise<AccountQuotaResult[]> {
  const results: AccountQuotaResult[] = [];
  
  logQuotaFetch("start", accounts.length);

  for (const [index, account] of accounts.entries()) {
    const disabled = account.enabled === false;

    let auth = buildAuthFromAccount(account);

    try {
      if (accessTokenExpired(auth)) {
        const refreshed = await refreshAccessToken(auth, client, providerId);
        if (!refreshed) {
          throw new Error("Token refresh failed");
        }
        auth = refreshed;
      }

      const projectContext = await ensureProjectContext(auth);
      auth = projectContext.auth;
      const updatedAccount = applyAccountUpdates(account, auth);

      let quotaResult: QuotaSummary;
      let geminiCliQuotaResult: GeminiCliQuotaSummary;
      
      // Fetch both Antigravity and Gemini CLI quotas in parallel
      const [antigravityResponse, geminiCliResponse] = await Promise.all([
        fetchAvailableModels(auth.access ?? "", projectContext.effectiveProjectId)
          .catch((error): FetchAvailableModelsResponse => ({ models: undefined })),
        fetchGeminiCliQuota(auth.access ?? "", projectContext.effectiveProjectId),
      ]);

      // Process Antigravity quota
      if (antigravityResponse.models === undefined) {
        quotaResult = {
          groups: {},
          modelCount: 0,
          error: "Failed to fetch Antigravity quota",
        };
      } else {
        quotaResult = aggregateQuota(antigravityResponse.models);
      }

      // Process Gemini CLI quota
      geminiCliQuotaResult = aggregateGeminiCliQuota(geminiCliResponse);
      if (geminiCliResponse.buckets === undefined || geminiCliResponse.buckets.length === 0) {
        geminiCliQuotaResult.error = geminiCliQuotaResult.models.length === 0 
          ? "No Gemini CLI quota available" 
          : undefined;
      }

      results.push({
        index,
        email: account.email,
        status: "ok",
        disabled,
        quota: quotaResult,
        geminiCliQuota: geminiCliQuotaResult,
        updatedAccount,
      });
      
      // Log quota status for each family
      for (const [family, groupQuota] of Object.entries(quotaResult.groups)) {
        const remainingPercent = (getGroupMinFraction(groupQuota) ?? 0) * 100;
        logQuotaStatus(account.email, index, remainingPercent, family);
      }
    } catch (error) {
      results.push({
        index,
        email: account.email,
        status: "error",
        disabled,
        error: error instanceof Error ? error.message : String(error),
      });
      logQuotaFetch("error", undefined, `account=${account.email ?? index} error=${error instanceof Error ? error.message : String(error)}`);
    }
  }

  logQuotaFetch("complete", accounts.length, `ok=${results.filter(r => r.status === "ok").length} errors=${results.filter(r => r.status === "error").length}`);
  return results;
}

export async function readModelLimits(configDir: string): Promise<ModelLimits> {
  try {
    const { readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const configPath = path.join(configDir, "antigravity.json");
    const raw = await readFile(configPath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const ml = parsed["model_limits"] as Partial<ModelLimits> | undefined;
    if (!ml) return getDefaultModelLimits();
    return {
      claude_context_limit: typeof ml.claude_context_limit === "number"
        ? ml.claude_context_limit
        : DEFAULT_CLAUDE_CONTEXT_LIMIT,
      claude_thinking_budget_max: typeof ml.claude_thinking_budget_max === "number"
        ? ml.claude_thinking_budget_max
        : DEFAULT_CLAUDE_THINKING_BUDGET,
      gemini_context_limit: typeof ml.gemini_context_limit === "number"
        ? ml.gemini_context_limit
        : DEFAULT_GEMINI_CONTEXT_LIMIT,
      last_discovered_at: typeof ml.last_discovered_at === "string"
        ? ml.last_discovered_at
        : undefined,
    };
  } catch {
    return getDefaultModelLimits();
  }
}

export async function discoverAndPersistModelLimits(
  configDir: string,
  quotaModels: Map<string, FetchAvailableModelEntry>,
): Promise<void> {
  try {
    let claudeContextLimit: number | undefined;
    let claudeThinkingBudgetMax: number | undefined;
    let geminiContextLimit: number | undefined;

    for (const [modelName, entry] of quotaModels) {
      const name = modelName.toLowerCase();
      if (name.includes("claude")) {
        if (entry.inputTokenLimit && (!claudeContextLimit || entry.inputTokenLimit < claudeContextLimit)) {
          claudeContextLimit = entry.inputTokenLimit;
        }
        if (entry.thinkingBudgetMax && (!claudeThinkingBudgetMax || entry.thinkingBudgetMax > claudeThinkingBudgetMax)) {
          claudeThinkingBudgetMax = entry.thinkingBudgetMax;
        }
      } else if (name.includes("gemini")) {
        if (entry.inputTokenLimit && (!geminiContextLimit || entry.inputTokenLimit > geminiContextLimit)) {
          geminiContextLimit = entry.inputTokenLimit;
        }
      }
    }

    if (!claudeContextLimit && !claudeThinkingBudgetMax && !geminiContextLimit) {
      return;
    }

    const current = await readModelLimits(configDir);
    const updated: ModelLimits = {
      claude_context_limit: claudeContextLimit ?? current.claude_context_limit,
      claude_thinking_budget_max: claudeThinkingBudgetMax ?? current.claude_thinking_budget_max,
      gemini_context_limit: geminiContextLimit ?? current.gemini_context_limit,
      last_discovered_at: new Date().toISOString(),
    };

    if (
      updated.claude_context_limit === current.claude_context_limit
      && updated.claude_thinking_budget_max === current.claude_thinking_budget_max
      && updated.gemini_context_limit === current.gemini_context_limit
    ) {
      return;
    }

    const { readFile, writeFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const configPath = path.join(configDir, "antigravity.json");

    let existing: Record<string, unknown> = {};
    try {
      const raw = await readFile(configPath, "utf-8");
      existing = JSON.parse(raw) as Record<string, unknown>;
    } catch {}

    existing["model_limits"] = updated;
    await writeFile(configPath, JSON.stringify(existing, null, 2) + "\n", "utf-8");
  } catch {}
}

/**
 * Resolves the effective thinking budget to use for a request.
 * Priority: variant config > tier from model suffix > server default
 * Special: -1 means server-controlled (pass through, don't send budget)
 */
export function resolveEffectiveThinkingBudget(
  serverBudget: number | undefined,
  variantBudget: number | undefined,
  modelDefault: number,
): number {
  // -1 = server-controlled, don't send thinkingBudget at all
  if (serverBudget === -1) return -1

  const effective = typeof variantBudget === "number" && variantBudget > 0
    ? variantBudget
    : (serverBudget ?? modelDefault)

  return Math.max(128, effective)
}
