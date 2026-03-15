import { PLUGIN_ID, PLUGIN_VERSION } from "./branding.js";
import type { GovernAction, PluginConfig } from "../types.js";

const DEFAULT_CONFIG_API_TIMEOUT_MS = 8_000;

type DefaultSandbox = NonNullable<PluginConfig["defaultSandbox"]>;
type DefaultApprovalPolicy = NonNullable<PluginConfig["defaultApprovalPolicy"]>;

export type ConfigApiPermissions = {
  canBind: boolean;
  canAsk: boolean;
  canStatus: boolean;
  canUnbind: boolean;
};

export type ConfigApiPolicy = {
  allowedRoots: string[];
  defaultSandbox?: DefaultSandbox;
  defaultApprovalPolicy?: DefaultApprovalPolicy;
  readOnlyCodex?: boolean;
  requireBindingForAsk?: boolean;
  requireProjectMatchForBind?: boolean;
};

export type ConfigApiProject = {
  id: string;
  name: string;
  repoPath: string;
  enabled: boolean;
  allowedRoles: string[];
  allowedConversationPrefixes: string[];
};

export type ConfigApiAccessDecision = {
  requestId?: string;
  roles: string[];
  permissions: ConfigApiPermissions;
  policy: ConfigApiPolicy;
  projects: ConfigApiProject[];
};

export type ConfigApiRequestInput = {
  action: GovernAction;
  provider: string;
  conversationKey: string;
  user: {
    id?: string;
    displayName?: string;
    username?: string;
    email?: string;
  };
  context: {
    accountId?: string;
    channelId?: string;
    threadId?: string;
  };
  requested: {
    projectId?: string;
    repoPath?: string;
  };
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asStringArray(value: unknown): string[] {
  return asArray(value)
    .map((item) => asString(item))
    .filter((item): item is string => Boolean(item));
}

function normalizePermissions(value: unknown): ConfigApiPermissions | undefined {
  const raw = asRecord(value);
  const canBind = asBoolean(raw.canBind);
  const canAsk = asBoolean(raw.canAsk);
  const canStatus = asBoolean(raw.canStatus);
  const canUnbind = asBoolean(raw.canUnbind);

  if (
    canBind === undefined ||
    canAsk === undefined ||
    canStatus === undefined ||
    canUnbind === undefined
  ) {
    return undefined;
  }

  return { canBind, canAsk, canStatus, canUnbind };
}

function normalizeProject(value: unknown): ConfigApiProject | undefined {
  const raw = asRecord(value);
  const id = asString(raw.id);
  const name = asString(raw.name);
  const repoPath = asString(raw.repoPath);
  const enabled = asBoolean(raw.enabled);

  if (!id || !name || !repoPath || enabled === undefined) {
    return undefined;
  }

  return {
    id,
    name,
    repoPath,
    enabled,
    allowedRoles: asStringArray(raw.allowedRoles),
    allowedConversationPrefixes: asStringArray(raw.allowedConversationPrefixes),
  };
}

function normalizePolicy(value: unknown): ConfigApiPolicy {
  const raw = asRecord(value);

  const defaultSandboxRaw = asString(raw.defaultSandbox);
  const defaultSandbox: DefaultSandbox | undefined =
    defaultSandboxRaw === "read-only" ||
    defaultSandboxRaw === "workspace-write" ||
    defaultSandboxRaw === "danger-full-access"
      ? defaultSandboxRaw
      : undefined;

  const defaultApprovalPolicyRaw = asString(raw.defaultApprovalPolicy);
  const defaultApprovalPolicy: DefaultApprovalPolicy | undefined =
    defaultApprovalPolicyRaw === "untrusted" ||
    defaultApprovalPolicyRaw === "on-request" ||
    defaultApprovalPolicyRaw === "never"
      ? defaultApprovalPolicyRaw
      : undefined;

  return {
    allowedRoots: asStringArray(raw.allowedRoots),
    defaultSandbox,
    defaultApprovalPolicy,
    readOnlyCodex: asBoolean(raw.readOnlyCodex),
    requireBindingForAsk: asBoolean(raw.requireBindingForAsk),
    requireProjectMatchForBind: asBoolean(raw.requireProjectMatchForBind),
  };
}

function timeoutFromConfig(config: PluginConfig): number {
  const raw = config.configApiTimeoutMs;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_CONFIG_API_TIMEOUT_MS;
  }
  return Math.round(raw);
}

function extractApiErrorMessage(value: unknown): string | undefined {
  const raw = asRecord(value);
  const nestedError = asRecord(raw.error);
  return asString(nestedError.message) || asString(raw.message);
}

function buildApiRequestPayload(config: PluginConfig, input: ConfigApiRequestInput): Record<string, unknown> {
  const organizationName = asString(config.organizationName);
  if (!organizationName) {
    throw new Error("organizationName is required when configApiUrl is configured.");
  }

  const payload: Record<string, unknown> = {
    organizationName,
    provider: input.provider,
    conversationKey: input.conversationKey,
    action: input.action,
    client: {
      pluginId: PLUGIN_ID,
      pluginVersion: PLUGIN_VERSION,
    },
  };

  const user: Record<string, unknown> = {};
  if (input.user.id) user.id = input.user.id;
  if (input.user.displayName) user.displayName = input.user.displayName;
  if (input.user.username) user.username = input.user.username;
  if (input.user.email) user.email = input.user.email;
  if (Object.keys(user).length > 0) {
    payload.user = user;
  }

  const context: Record<string, unknown> = {};
  if (input.context.accountId) context.accountId = input.context.accountId;
  if (input.context.channelId) context.channelId = input.context.channelId;
  if (input.context.threadId) context.threadId = input.context.threadId;
  if (Object.keys(context).length > 0) {
    payload.context = context;
  }

  const requested: Record<string, unknown> = {};
  if (input.requested.projectId) requested.projectId = input.requested.projectId;
  if (input.requested.repoPath) requested.repoPath = input.requested.repoPath;
  if (Object.keys(requested).length > 0) {
    payload.requested = requested;
  }

  return payload;
}

export function isConfigApiEnabled(config: PluginConfig): boolean {
  return Boolean(asString(config.configApiUrl));
}

export async function fetchConfigApiDecision(
  config: PluginConfig,
  input: ConfigApiRequestInput,
): Promise<ConfigApiAccessDecision | null> {
  const apiUrl = asString(config.configApiUrl);
  if (!apiUrl) {
    return null;
  }

  const timeoutMs = timeoutFromConfig(config);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  const apiToken = asString(config.configApiToken);
  if (apiToken) {
    headers.authorization = `Bearer ${apiToken}`;
  }

  let response: Response;

  try {
    response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(buildApiRequestPayload(config, input)),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Config API request timed out after ${timeoutMs}ms.`);
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Config API request failed: ${message}`);
  } finally {
    clearTimeout(timeout);
  }

  const rawText = await response.text();
  let payload: unknown = undefined;

  if (rawText.trim().length > 0) {
    try {
      payload = JSON.parse(rawText);
    } catch {
      throw new Error(`Config API returned non-JSON response (HTTP ${response.status}).`);
    }
  }

  if (!response.ok) {
    const apiError = extractApiErrorMessage(payload);
    if (apiError) {
      throw new Error(`Config API rejected request (${response.status}): ${apiError}`);
    }
    throw new Error(`Config API rejected request with HTTP ${response.status}.`);
  }

  const raw = asRecord(payload);
  if (raw.ok !== true) {
    const apiError = extractApiErrorMessage(payload);
    throw new Error(apiError ? `Config API denied action: ${apiError}` : "Config API returned an invalid success payload.");
  }

  const user = asRecord(raw.user);
  const permissions = normalizePermissions(user.permissions);
  if (!permissions) {
    throw new Error("Config API response is missing user.permissions.");
  }

  return {
    requestId: asString(raw.requestId),
    roles: asStringArray(user.roles),
    permissions,
    policy: normalizePolicy(raw.policy),
    projects: asArray(raw.projects)
      .map((project) => normalizeProject(project))
      .filter((project): project is ConfigApiProject => Boolean(project)),
  };
}

export function isActionAllowedByPermissions(
  permissions: ConfigApiPermissions,
  action: GovernAction,
): boolean {
  switch (action) {
    case "bind":
      return permissions.canBind;
    case "ask":
      return permissions.canAsk;
    case "status":
      return permissions.canStatus;
    case "unbind":
      return permissions.canUnbind;
    default:
      return false;
  }
}

export function applyApiPolicyToConfig(config: PluginConfig, policy: ConfigApiPolicy): PluginConfig {
  const nextConfig: PluginConfig = {
    ...config,
  };

  if (policy.allowedRoots.length > 0) {
    nextConfig.allowedRoots = [...policy.allowedRoots];
  }

  if (policy.defaultSandbox) {
    nextConfig.defaultSandbox = policy.defaultSandbox;
  }

  if (policy.defaultApprovalPolicy) {
    nextConfig.defaultApprovalPolicy = policy.defaultApprovalPolicy;
  }

  if (policy.readOnlyCodex) {
    nextConfig.defaultSandbox = "read-only";
    nextConfig.defaultApprovalPolicy = "never";
  }

  return nextConfig;
}
