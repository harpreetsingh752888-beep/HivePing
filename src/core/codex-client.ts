import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { PLUGIN_ID, PLUGIN_NAME, PLUGIN_VERSION } from "./branding.js";
import type { ConversationHistoryEntry } from "./history-store.js";
import type { PluginConfig } from "../types.js";

type PromptMode = "read-only" | "write-enabled";

function resolveReasoningCommand(config: PluginConfig): string {
  return config.reasoningCommand || config.codexCommand || "codex";
}

function resolveReasoningArgs(config: PluginConfig): string[] {
  if (Array.isArray(config.reasoningArgs)) {
    return config.reasoningArgs;
  }
  return ["mcp-server"];
}

function resolveReasoningToolName(config: PluginConfig): string {
  return config.reasoningToolName || "codex";
}

function asText(result: any): string {
  if (typeof result?.structuredContent?.content === "string") {
    return result.structuredContent.content;
  }

  if (Array.isArray(result?.content)) {
    const text = result.content
      .filter((item: any) => item?.type === "text" && typeof item?.text === "string")
      .map((item: any) => item.text)
      .join("\n\n")
      .trim();

    if (text) return text;
  }

  return "The reasoning backend returned no text output.";
}

function buildHistoryBlock(history: readonly ConversationHistoryEntry[] | undefined): string[] {
  if (!history || history.length === 0) {
    return [];
  }

  const lines: string[] = ["Recent conversation context (oldest first):"];

  for (const item of history.slice(-10)) {
    const role = item.role === "assistant" ? "assistant" : "user";
    const content = item.content.trim();
    if (!content) {
      continue;
    }
    lines.push(`${role}: ${content}`);
  }

  lines.push("");
  return lines;
}

function buildReasoningPrompt(
  userPrompt: string,
  mode: PromptMode,
  history?: readonly ConversationHistoryEntry[],
): string {
  const historyLines = buildHistoryBlock(history);

  if (mode === "read-only") {
    return [
      `You are being called from the ${PLUGIN_NAME} OpenClaw plugin.`,
      "Treat this as a READ-ONLY repository analysis request.",
      "Do not modify files, do not create files, do not run destructive commands, and do not change git state.",
      "Answer clearly and directly based on the repository in the provided cwd.",
      "",
      ...historyLines,
      `User request: ${userPrompt}`,
    ].join("\n");
  }

  return [
    `You are being called from the ${PLUGIN_NAME} OpenClaw plugin.`,
    "You may modify files in the provided cwd when needed to satisfy the user request.",
    "Prefer minimal, focused diffs and preserve existing behavior unless the user asked for behavioral changes.",
    "Do not run destructive git operations (for example reset --hard, checkout --, or broad file deletions) unless explicitly requested.",
    "After completing edits, summarize what changed and why.",
    "",
    ...historyLines,
    `User request: ${userPrompt}`,
  ].join("\n");
}

function isLandlockSandboxError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = String(error.message || "");
  return (
    /Sandbox\(LandlockRestrict\)/i.test(message) ||
    /applying legacy Linux sandbox restrictions/i.test(message)
  );
}

async function callReasoningTool(params: {
  client: Client;
  config: PluginConfig;
  prompt: string;
  promptMode: PromptMode;
  history?: readonly ConversationHistoryEntry[];
  cwd: string;
  sandbox: PluginConfig["defaultSandbox"];
  approvalPolicy: PluginConfig["defaultApprovalPolicy"];
  model?: string;
  profile?: string;
}): Promise<any> {
  const args: Record<string, unknown> = {
    prompt: buildReasoningPrompt(params.prompt, params.promptMode, params.history),
    cwd: params.cwd,
    sandbox: params.sandbox,
    "approval-policy": params.approvalPolicy,
  };

  if (params.model) args.model = params.model;
  if (params.profile) args.profile = params.profile;

  return await params.client.callTool({
    name: resolveReasoningToolName(params.config),
    arguments: args,
  });
}

export async function callReasoningOnce(
  config: PluginConfig,
  cwd: string,
  prompt: string,
  history?: readonly ConversationHistoryEntry[],
): Promise<{ text: string; structuredContent?: any }> {
  const transport = new StdioClientTransport({
    command: resolveReasoningCommand(config),
    args: resolveReasoningArgs(config),
    env: process.env,
  });

  const client = new Client({
    name: PLUGIN_ID,
    version: PLUGIN_VERSION,
  });

  try {
    await client.connect(transport);

    const listed = await client.listTools();
    const toolNames = (listed?.tools || []).map((tool: any) => tool.name);
    const toolName = resolveReasoningToolName(config);
    if (!toolNames.includes(toolName)) {
      throw new Error(
        `Reasoning MCP server is up, but "${toolName}" tool was not exposed. Tools seen: ${toolNames.join(", ")}`,
      );
    }

    const configuredSandbox = config.defaultSandbox || "read-only";
    const approvalPolicy = config.defaultApprovalPolicy || "never";
    const promptMode: PromptMode = configuredSandbox === "read-only" ? "read-only" : "write-enabled";

    let result: any;
    try {
      result = await callReasoningTool({
        client,
        config,
        prompt,
        promptMode,
        history,
        cwd,
        sandbox: configuredSandbox,
        approvalPolicy,
        model: config.defaultModel,
        profile: config.defaultProfile,
      });
    } catch (error) {
      if (configuredSandbox !== "danger-full-access" && isLandlockSandboxError(error)) {
        result = await callReasoningTool({
          client,
          config,
          prompt,
          promptMode,
          history,
          cwd,
          sandbox: "danger-full-access",
          approvalPolicy,
          model: config.defaultModel,
          profile: config.defaultProfile,
        });
      } else {
        throw error;
      }
    }

    return {
      text: asText(result),
      structuredContent: result?.structuredContent,
    };
  } finally {
    try {
      await client.close?.();
    } catch {}

    try {
      await transport.close?.();
    } catch {}
  }
}
