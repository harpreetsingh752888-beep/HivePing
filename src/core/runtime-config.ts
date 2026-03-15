import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { PluginConfig } from "../types.js";

export type ManagedRuntimeConfig = Pick<
  PluginConfig,
  | "reasoningCommand"
  | "reasoningArgs"
  | "reasoningToolName"
  | "defaultModel"
  | "defaultProfile"
  | "rolePolicyEnabled"
  | "rolePolicyDir"
  | "skillsFile"
  | "skillsMode"
  | "approvalRequestsFile"
  | "changeSandbox"
  | "changeApprovalPolicy"
  | "actionWebhookUrl"
  | "actionWebhookToken"
  | "actionWebhookTimeoutMs"
>;

const MANAGED_KEYS = [
  "reasoningCommand",
  "reasoningArgs",
  "reasoningToolName",
  "defaultModel",
  "defaultProfile",
  "rolePolicyEnabled",
  "rolePolicyDir",
  "skillsFile",
  "skillsMode",
  "approvalRequestsFile",
  "changeSandbox",
  "changeApprovalPolicy",
  "actionWebhookUrl",
  "actionWebhookToken",
  "actionWebhookTimeoutMs",
] as const;

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value
    .map((item) => asString(item))
    .filter((item): item is string => Boolean(item));

  return normalized;
}

function normalizeManagedRuntimeConfig(raw: unknown): ManagedRuntimeConfig {
  const record = asRecord(raw);
  const normalized: ManagedRuntimeConfig = {};

  const reasoningCommand = asString(record.reasoningCommand);
  if (reasoningCommand) {
    normalized.reasoningCommand = reasoningCommand;
  }

  const reasoningArgs = asStringArray(record.reasoningArgs);
  if (reasoningArgs) {
    normalized.reasoningArgs = reasoningArgs;
  }

  const reasoningToolName = asString(record.reasoningToolName);
  if (reasoningToolName) {
    normalized.reasoningToolName = reasoningToolName;
  }

  const defaultModel = asString(record.defaultModel);
  if (defaultModel) {
    normalized.defaultModel = defaultModel;
  }

  const defaultProfile = asString(record.defaultProfile);
  if (defaultProfile) {
    normalized.defaultProfile = defaultProfile;
  }

  if (typeof record.rolePolicyEnabled === "boolean") {
    normalized.rolePolicyEnabled = record.rolePolicyEnabled;
  }

  const rolePolicyDir = asString(record.rolePolicyDir);
  if (rolePolicyDir) {
    normalized.rolePolicyDir = rolePolicyDir;
  }

  const skillsFile = asString(record.skillsFile);
  if (skillsFile) {
    normalized.skillsFile = skillsFile;
  }

  const skillsMode = asString(record.skillsMode);
  if (skillsMode === "rules" || skillsMode === "agent") {
    normalized.skillsMode = skillsMode;
  }

  const approvalRequestsFile = asString(record.approvalRequestsFile);
  if (approvalRequestsFile) {
    normalized.approvalRequestsFile = approvalRequestsFile;
  }

  const changeSandbox = asString(record.changeSandbox);
  if (changeSandbox === "workspace-write" || changeSandbox === "danger-full-access") {
    normalized.changeSandbox = changeSandbox;
  }

  const changeApprovalPolicy = asString(record.changeApprovalPolicy);
  if (
    changeApprovalPolicy === "untrusted" ||
    changeApprovalPolicy === "on-request" ||
    changeApprovalPolicy === "never"
  ) {
    normalized.changeApprovalPolicy = changeApprovalPolicy;
  }

  const actionWebhookUrl = asString(record.actionWebhookUrl);
  if (actionWebhookUrl) {
    normalized.actionWebhookUrl = actionWebhookUrl;
  }

  const actionWebhookToken = asString(record.actionWebhookToken);
  if (actionWebhookToken) {
    normalized.actionWebhookToken = actionWebhookToken;
  }

  const actionWebhookTimeoutMs = Number(record.actionWebhookTimeoutMs);
  if (Number.isFinite(actionWebhookTimeoutMs) && actionWebhookTimeoutMs >= 500) {
    normalized.actionWebhookTimeoutMs = Math.round(actionWebhookTimeoutMs);
  }

  return normalized;
}

function writeRuntimeConfigPayload(value: ManagedRuntimeConfig): string {
  const output: Record<string, unknown> = {};
  for (const key of MANAGED_KEYS) {
    if (typeof value[key] !== "undefined") {
      output[key] = value[key];
    }
  }
  return `${JSON.stringify(output, null, 2)}\n`;
}

export function loadManagedRuntimeConfigSync(filePath: string): ManagedRuntimeConfig {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return normalizeManagedRuntimeConfig(parsed);
  } catch {
    return {};
  }
}

export async function loadManagedRuntimeConfig(filePath: string): Promise<ManagedRuntimeConfig> {
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return normalizeManagedRuntimeConfig(parsed);
  } catch {
    return {};
  }
}

export async function updateManagedRuntimeConfig(
  filePath: string,
  patch: ManagedRuntimeConfig,
): Promise<ManagedRuntimeConfig> {
  const current = await loadManagedRuntimeConfig(filePath);
  const next = normalizeManagedRuntimeConfig({
    ...current,
    ...patch,
  });

  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, writeRuntimeConfigPayload(next), "utf8");
  return next;
}
