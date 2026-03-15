import { PLUGIN_NAME } from "./branding.js";
import type { ConversationHistoryEntry } from "./history-store.js";
import { callReasoningOnce } from "./codex-client.js";
import { loadSkillsDocument, type SkillMatchResult, type SkillRoute } from "./skill-router.js";
import type { PluginConfig } from "../types.js";

type AgentSkillDecision = {
  matched: boolean;
  reason?: string;
  route?: SkillRoute;
};

export type AgentSkillMatchResult = SkillMatchResult & {
  sourceFilePath: string;
  rawDecision: string;
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringRecord(value: unknown): Record<string, string> | undefined {
  const raw = asRecord(value);
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(raw)) {
    const normalized = asString(item);
    if (normalized) {
      out[key] = normalized;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeMethod(value: unknown): "GET" | "POST" | undefined {
  const method = asString(value)?.toUpperCase();
  if (method === "GET" || method === "POST") {
    return method;
  }
  return undefined;
}

function normalizeRouteName(name: string | undefined, urlText: string): string {
  const normalized = name?.trim().toLowerCase();
  if (normalized && /^[a-z][a-z0-9._:-]{1,63}$/.test(normalized)) {
    return normalized;
  }

  try {
    const parsed = new URL(urlText);
    const slug = `${parsed.hostname}${parsed.pathname}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/^\.+|\.+$/g, "")
      .replace(/\.{2,}/g, ".");

    const candidate = `action.${slug}`.slice(0, 64);
    if (/^[a-z][a-z0-9._:-]{1,63}$/.test(candidate)) {
      return candidate;
    }
  } catch {
    // Ignore URL parse fallback errors.
  }

  return "action.semantic.route";
}

function normalizeRouteFromDecision(value: unknown, fallbackReason?: string): SkillRoute | undefined {
  const raw = asRecord(value);
  const http = asRecord(raw.http);

  const method = normalizeMethod(http.method ?? raw.method);
  const url = asString(http.url ?? raw.url ?? raw.endpoint);
  if (!method || !url) {
    return undefined;
  }

  const name = normalizeRouteName(asString(raw.name ?? raw.action ?? raw.id), url);
  const description = asString(raw.description ?? raw.summary ?? fallbackReason);

  const headers = asStringRecord(http.headers ?? raw.headers);
  const query = asStringRecord(http.query ?? raw.query);
  const responseRaw = asRecord(raw.response);
  const responseField = asString(responseRaw.field ?? raw.responseField ?? raw.response_field);

  return {
    name,
    ...(description ? { description } : {}),
    ...(responseField ? { response: { field: responseField } } : {}),
    approval: {
      required: true,
    },
    http: {
      method,
      url,
      ...(headers ? { headers } : {}),
      ...(query ? { query } : {}),
    },
  };
}

function extractJsonCandidates(rawText: string): string[] {
  const candidates: string[] = [];

  for (const match of rawText.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    const body = match[1]?.trim();
    if (body) {
      candidates.push(body);
    }
  }

  const trimmed = rawText.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    candidates.push(trimmed);
  }

  const firstBrace = rawText.indexOf("{");
  const lastBrace = rawText.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const objectSlice = rawText.slice(firstBrace, lastBrace + 1).trim();
    if (objectSlice) {
      candidates.push(objectSlice);
    }
  }

  return Array.from(new Set(candidates));
}

export function parseAgentSkillDecisionText(rawText: string): AgentSkillDecision | null {
  for (const candidate of extractJsonCandidates(rawText)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }

    const record = asRecord(parsed);
    const reason = asString(record.reason ?? record.why ?? record.explanation);

    const explicitMatch =
      typeof record.match === "boolean"
        ? record.match
        : typeof record.matched === "boolean"
          ? record.matched
          : typeof record.should_call === "boolean"
            ? record.should_call
            : undefined;

    const routeCandidate =
      record.action ??
      record.route ??
      record.skill ??
      record.selected ??
      (record.http ? record : undefined);

    const route = normalizeRouteFromDecision(routeCandidate, reason);
    const matched = explicitMatch ?? Boolean(route);

    if (!matched) {
      return {
        matched: false,
        ...(reason ? { reason } : {}),
      };
    }

    if (!route) {
      continue;
    }

    return {
      matched: true,
      reason,
      route,
    };
  }

  return null;
}

function buildHistoryContext(history: readonly ConversationHistoryEntry[] | undefined): string {
  if (!history || history.length === 0) {
    return "";
  }

  const lines = history
    .slice(-8)
    .map((item) => `${item.role}: ${item.content.trim()}`)
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return "";
  }

  return [`Recent channel context (oldest first):`, ...lines, ""].join("\n");
}

function buildAgentRoutingPrompt(params: {
  userPrompt: string;
  skillsMarkdown: string;
  history?: readonly ConversationHistoryEntry[];
}): string {
  return [
    `You are a semantic action router for the ${PLUGIN_NAME} plugin.`,
    "Read the SKILLS markdown and decide whether the user request should trigger an external HTTP action.",
    "Never invent a URL. Only use URLs that appear in the provided SKILLS markdown.",
    "If no safe/clear match exists, respond with match=false.",
    "Return JSON only (no prose).",
    "",
    "Output schema:",
    "{",
    '  "match": boolean,',
    '  "reason": "short reason",',
    '  "action": {',
    '    "name": "action.name",',
    '    "description": "summary",',
    '    "method": "GET|POST",',
    '    "url": "https://...",',
    '    "headers": { "optional": "header-values" },',
    '    "query": { "optional": "query-values" },',
    '    "response": { "field": "optional json field name to return" }',
    "  }",
    "}",
    "",
    "Rules:",
    "- Set match=true only when action.method and action.url are both known from SKILLS markdown.",
    "- If ambiguous, set match=false.",
    "- Keep reason concise.",
    "",
    buildHistoryContext(params.history),
    "SKILLS markdown:",
    "```md",
    params.skillsMarkdown,
    "```",
    "",
    `User request: ${params.userPrompt}`,
  ].join("\n");
}

export async function matchSkillRouteWithAgent(params: {
  config: PluginConfig;
  repoPath: string;
  userPrompt: string;
  history?: readonly ConversationHistoryEntry[];
}): Promise<AgentSkillMatchResult | null> {
  const document = await loadSkillsDocument(params.config, params.repoPath);
  if (!document) {
    return null;
  }

  const routingConfig: PluginConfig = {
    ...params.config,
    defaultSandbox: "read-only",
    defaultApprovalPolicy: "never",
  };

  const reasoningResponse = await callReasoningOnce(
    routingConfig,
    params.repoPath,
    buildAgentRoutingPrompt({
      userPrompt: params.userPrompt,
      skillsMarkdown: document.content,
      history: params.history,
    }),
  );

  const decision = parseAgentSkillDecisionText(reasoningResponse.text);
  if (!decision || !decision.matched || !decision.route) {
    return null;
  }

  return {
    route: decision.route,
    reason: decision.reason || "semantic skills match",
    sourceFilePath: document.filePath,
    rawDecision: reasoningResponse.text,
  };
}
