import { PLUGIN_ID, PRIMARY_MENTION_ALIAS } from "./branding.js";
import type { ConversationHistoryEntry } from "./history-store.js";
import type { ApprovalRequest, PluginConfig } from "../types.js";

const DEFAULT_WEBHOOK_TIMEOUT_MS = 8_000;

export type ExternalActionInput = {
  name: string;
  payload: Record<string, unknown>;
  summary: string;
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringRecord(value: unknown): Record<string, string> {
  const raw = asRecord(value);
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(raw)) {
    const normalized = asString(item);
    if (normalized) {
      out[key] = normalized;
    }
  }
  return out;
}

function readDotPath(source: unknown, rawPath: string): unknown {
  if (!rawPath.trim()) {
    return undefined;
  }

  const segments = rawPath
    .split(".")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    return undefined;
  }

  let current: unknown = source;
  for (const segment of segments) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function truncate(value: string, maxLength = 500): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}...`;
}

function webhookTimeoutMs(config: PluginConfig): number {
  const raw = config.actionWebhookTimeoutMs;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_WEBHOOK_TIMEOUT_MS;
  }
  return Math.max(500, Math.round(raw));
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeActionName(raw: string): string {
  const normalized = raw.trim().toLowerCase();
  if (!/^[a-z][a-z0-9._:-]{1,63}$/.test(normalized)) {
    throw new Error(externalActionUsage());
  }
  return normalized;
}

function payloadSummary(payload: Record<string, unknown>): string {
  const summary = asString(payload.summary);
  if (summary) {
    return summary;
  }

  const title = asString(payload.title) || asString(payload.name) || asString(payload.subject);
  if (title) {
    return title;
  }

  const compact = JSON.stringify(payload);
  if (compact.length <= 140) {
    return compact;
  }

  return truncate(compact, 140);
}

export function externalActionUsage(): string {
  return [
    "Usage:",
    `${PRIMARY_MENTION_ALIAS} action <action-name> <json-payload>`,
    "Example:",
    `${PRIMARY_MENTION_ALIAS} action issue.create {"tracker":"github","title":"Login bug","description":"OAuth callback returns 500","labels":["bug","backend"]}`,
    `${PRIMARY_MENTION_ALIAS} action jira.ticket.create {"project":"ACC","summary":"Retry policy bug","description":"Retries are not capped"}`,
  ].join("\n");
}

export function parseExternalActionInput(rawArgs: string): ExternalActionInput {
  const trimmed = rawArgs.trim();
  if (!trimmed) {
    throw new Error(externalActionUsage());
  }

  const firstSpace = trimmed.indexOf(" ");
  if (firstSpace <= 0) {
    throw new Error(externalActionUsage());
  }

  const name = normalizeActionName(trimmed.slice(0, firstSpace));
  const payloadRaw = trimmed.slice(firstSpace + 1).trim();
  if (!payloadRaw) {
    throw new Error(externalActionUsage());
  }

  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(payloadRaw);
  } catch {
    throw new Error(externalActionUsage());
  }

  if (!isObjectRecord(parsedPayload)) {
    throw new Error(externalActionUsage());
  }

  return {
    name,
    payload: parsedPayload,
    summary: payloadSummary(parsedPayload),
  };
}

export async function executeApprovedWebhookAction(params: {
  config: PluginConfig;
  request: ApprovalRequest;
  approvedBy: string;
  approvalReason?: string;
  discussion?: ConversationHistoryEntry[];
}): Promise<{ responseSummary: string }> {
  const action = params.request.externalAction;
  if (!action) {
    throw new Error("Approval request does not contain a valid external action payload.");
  }

  const actionPayload = asRecord(action.payload);
  const mode = asString(actionPayload.mode)?.toLowerCase();
  if (mode === "http") {
    return await executeApprovedHttpAction({
      ...params,
      action,
      actionPayload,
    });
  }

  return await executeApprovedWebhookProxyAction({
    ...params,
    action,
  });
}

async function executeApprovedHttpAction(params: {
  config: PluginConfig;
  request: ApprovalRequest;
  approvedBy: string;
  approvalReason?: string;
  discussion?: ConversationHistoryEntry[];
  action: NonNullable<ApprovalRequest["externalAction"]>;
  actionPayload: Record<string, unknown>;
}): Promise<{ responseSummary: string }> {
  const method = asString(params.actionPayload.method)?.toUpperCase();
  const urlText = asString(params.actionPayload.url);
  if (!method || (method !== "GET" && method !== "POST") || !urlText) {
    throw new Error(
      "Invalid external action HTTP payload. Expected mode=http with method GET|POST and url.",
    );
  }

  const requestUrl = new URL(urlText);
  const query = asStringRecord(params.actionPayload.query);
  for (const [key, value] of Object.entries(query)) {
    requestUrl.searchParams.set(key, value);
  }
  requestUrl.searchParams.set("requestId", params.request.id);
  requestUrl.searchParams.set("action", params.action.name);

  const headers = asStringRecord(params.actionPayload.headers);

  const bodyPayload = {
    event: `${PLUGIN_ID}.approval.approved`,
    requestId: params.request.id,
    approvedAt: new Date().toISOString(),
    requestType: params.request.requestType || "codex-change",
    approval: {
      approvedBy: params.approvedBy,
      reason: params.approvalReason,
    },
    request: {
      conversationKey: params.request.conversationKey,
      provider: params.request.provider,
      projectId: params.request.projectId,
      repoPath: params.request.repoPath,
      requestedBy: params.request.requestedBy,
      requestedRole: params.request.requestedRole,
      requiredRole: params.request.requiredRole,
      prompt: params.request.prompt,
      ticketRef: params.request.ticketRef,
    },
    action: {
      name: params.action.name,
      summary: params.action.summary,
    },
    input: asRecord(params.actionPayload.input),
    metadata: asRecord(params.actionPayload.metadata),
    discussion: (params.discussion || []).map((entry) => ({
      role: entry.role,
      content: entry.content,
      at: entry.at,
    })),
  };

  const requestInit: RequestInit = {
    method,
    headers,
  };

  if (method === "POST") {
    headers["content-type"] = headers["content-type"] || "application/json";
    requestInit.body = JSON.stringify(bodyPayload);
  }

  const token = asString(params.config.actionWebhookToken);
  if (token && !headers.authorization) {
    headers.authorization = `Bearer ${token}`;
  }

  return await executeHttpRequest({
    config: params.config,
    requestUrl: requestUrl.toString(),
    requestInit,
    actionPayload: params.actionPayload,
  });
}

async function executeApprovedWebhookProxyAction(params: {
  config: PluginConfig;
  request: ApprovalRequest;
  approvedBy: string;
  approvalReason?: string;
  discussion?: ConversationHistoryEntry[];
  action: NonNullable<ApprovalRequest["externalAction"]>;
}): Promise<{ responseSummary: string }> {
  const webhookUrl = asString(params.config.actionWebhookUrl);
  if (!webhookUrl) {
    throw new Error("No external action transport configured. Set action mode=http or actionWebhookUrl.");
  }

  const payload = {
    event: `${PLUGIN_ID}.approval.approved`,
    requestId: params.request.id,
    approvedAt: new Date().toISOString(),
    requestType: params.request.requestType || "codex-change",
    approval: {
      approvedBy: params.approvedBy,
      reason: params.approvalReason,
    },
    request: {
      conversationKey: params.request.conversationKey,
      provider: params.request.provider,
      projectId: params.request.projectId,
      repoPath: params.request.repoPath,
      requestedBy: params.request.requestedBy,
      requestedRole: params.request.requestedRole,
      requiredRole: params.request.requiredRole,
      prompt: params.request.prompt,
      ticketRef: params.request.ticketRef,
    },
    action: {
      name: params.action.name,
      summary: params.action.summary,
      payload: params.action.payload,
    },
    discussion: (params.discussion || []).map((entry) => ({
      role: entry.role,
      content: entry.content,
      at: entry.at,
    })),
  };

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  const token = asString(params.config.actionWebhookToken);
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  return await executeHttpRequest({
    config: params.config,
    requestUrl: webhookUrl,
    requestInit: {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    },
  });
}

async function executeHttpRequest(params: {
  config: PluginConfig;
  requestUrl: string;
  requestInit: RequestInit;
  actionPayload?: Record<string, unknown>;
}): Promise<{ responseSummary: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), webhookTimeoutMs(params.config));

  let response: Response;
  try {
    response = await fetch(params.requestUrl, {
      ...params.requestInit,
      signal: controller.signal,
    });
  } catch (error) {
    throw new Error(`External action request failed: ${String(error)}`);
  } finally {
    clearTimeout(timeout);
  }

  const responseText = await response.text();
  if (!response.ok) {
    const bodyText = truncate(responseText || "(empty)");
    throw new Error(
      `External action failed (${response.status} ${response.statusText || "error"}): ${bodyText}`,
    );
  }

  const responseField = asString(asRecord(asRecord(params.actionPayload).response).field);
  if (responseField) {
    try {
      const parsed = JSON.parse(responseText || "{}");
      const selected = readDotPath(parsed, responseField);
      if (selected !== undefined && selected !== null) {
        return {
          responseSummary: truncate(
            typeof selected === "string" ? selected : JSON.stringify(selected),
          ),
        };
      }
    } catch {
      // Keep default raw response summary fallback below.
    }
  }

  return {
    responseSummary: responseText ? truncate(responseText) : "ok",
  };
}
