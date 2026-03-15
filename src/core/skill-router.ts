import fs from "node:fs/promises";
import path from "node:path";
import type { PluginConfig } from "../types.js";

export type SkillHttpMethod = "GET" | "POST";

export type SkillRoute = {
  name: string;
  description?: string;
  response?: {
    field?: string;
  };
  match?: {
    any?: string[];
    regex?: string;
  };
  approval?: {
    required?: boolean;
  };
  http: {
    method: SkillHttpMethod;
    url: string;
    headers?: Record<string, string>;
    query?: Record<string, string>;
  };
};

export type SkillMatchResult = {
  route: SkillRoute;
  reason: string;
  regexCaptures?: string[];
};

export type SkillsDocument = {
  filePath: string;
  content: string;
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

function normalizeMethod(value: unknown): SkillHttpMethod | undefined {
  const raw = asString(value)?.toUpperCase();
  if (raw === "GET" || raw === "POST") {
    return raw;
  }
  return undefined;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value
    .map((item) => asString(item))
    .filter((item): item is string => Boolean(item))
    .map((item) => item.toLowerCase());

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeSkillRoute(value: unknown): SkillRoute | undefined {
  const raw = asRecord(value);
  const name = asString(raw.name)?.toLowerCase();
  if (!name || !/^[a-z][a-z0-9._:-]{1,63}$/.test(name)) {
    return undefined;
  }

  const httpRaw = asRecord(raw.http);
  const method = normalizeMethod(httpRaw.method);
  const url = asString(httpRaw.url);
  if (!method || !url) {
    return undefined;
  }

  const matchRaw = asRecord(raw.match);
  const any = normalizeStringArray(matchRaw.any);
  const regex = asString(matchRaw.regex);
  if (!any && !regex) {
    return undefined;
  }

  const description = asString(raw.description);
  const responseRaw = asRecord(raw.response);
  const responseField = asString(responseRaw.field ?? raw.responseField ?? raw.response_field);
  const approvalRaw = asRecord(raw.approval);
  const headers = asStringRecord(httpRaw.headers) || {};
  const query = asStringRecord(httpRaw.query) || {};

  return {
    name,
    ...(description ? { description } : {}),
    ...(responseField ? { response: { field: responseField } } : {}),
    match: {
      ...(any ? { any } : {}),
      ...(regex ? { regex } : {}),
    },
    approval: {
      required: approvalRaw.required === false ? false : true,
    },
    http: {
      method,
      url,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
      ...(Object.keys(query).length > 0 ? { query } : {}),
    },
  };
}

function extractJsonCodeBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  const regex = /```(?:json|jsonc)?\s*([\s\S]*?)```/gi;
  for (const match of markdown.matchAll(regex)) {
    const body = match[1]?.trim();
    if (body) {
      blocks.push(body);
    }
  }
  return blocks;
}

function splitListValue(value: string): string[] {
  return value
    .split(/[|,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function splitKeyValueList(value: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of splitListValue(value)) {
    const separator = pair.indexOf("=");
    if (separator <= 0 || separator === pair.length - 1) {
      continue;
    }
    const key = pair.slice(0, separator).trim();
    const mappedValue = pair.slice(separator + 1).trim();
    if (!key || !mappedValue) {
      continue;
    }
    out[key] = mappedValue;
  }
  return out;
}

function parseBoolean(value: string): boolean | undefined {
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "yes" || normalized === "1") {
    return true;
  }
  if (normalized === "false" || normalized === "no" || normalized === "0") {
    return false;
  }
  return undefined;
}

function parseMarkdownSection(sectionLines: string[]): SkillRoute | undefined {
  if (sectionLines.length === 0) {
    return undefined;
  }

  const fields = new Map<string, string>();

  for (const line of sectionLines) {
    const match = line.match(/^\s*(?:[-*]\s*)?([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.+?)\s*$/);
    if (!match) {
      continue;
    }
    const key = match[1]?.trim().toLowerCase();
    const value = match[2]?.trim();
    if (!key || !value) {
      continue;
    }
    fields.set(key, value);
  }

  const name = fields.get("action") || fields.get("name") || fields.get("skill");
  const method = fields.get("method") || fields.get("http_method");
  const url = fields.get("url") || fields.get("http_url") || fields.get("endpoint");
  const matchAny = fields.get("match_any") || fields.get("any") || fields.get("keywords");
  const matchRegex = fields.get("match_regex") || fields.get("regex") || fields.get("pattern");
  const description = fields.get("description") || fields.get("summary");
  const responseField =
    fields.get("response_field") ||
    fields.get("responsefield") ||
    fields.get("return_field") ||
    fields.get("output_field");
  const approvalRequired =
    parseBoolean(
      fields.get("approval_required") || fields.get("approval") || fields.get("require_approval") || "",
    ) ?? true;

  if (!name || !method || !url || (!matchAny && !matchRegex)) {
    return undefined;
  }

  const headers = splitKeyValueList(fields.get("headers") || "");
  const query = splitKeyValueList(fields.get("query") || "");

  return normalizeSkillRoute({
    name,
    ...(description ? { description } : {}),
    ...(responseField ? { response: { field: responseField } } : {}),
    match: {
      ...(matchAny ? { any: splitListValue(matchAny) } : {}),
      ...(matchRegex ? { regex: matchRegex } : {}),
    },
    approval: {
      required: approvalRequired,
    },
    http: {
      method,
      url,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
      ...(Object.keys(query).length > 0 ? { query } : {}),
    },
  });
}

function parseMarkdownSkills(rawText: string): SkillRoute[] {
  const lines = rawText.split(/\r?\n/);
  const sections: string[][] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (/^\s*##+\s+/.test(line)) {
      if (current.length > 0) {
        sections.push(current);
      }
      current = [];
      continue;
    }

    if (current || sections.length > 0) {
      current.push(line);
    }
  }

  if (current.length > 0) {
    sections.push(current);
  }

  // Fallback: single-section file (no headings).
  if (sections.length === 0) {
    const single = parseMarkdownSection(lines);
    return single ? [single] : [];
  }

  return sections
    .map((sectionLines) => parseMarkdownSection(sectionLines))
    .filter((route): route is SkillRoute => Boolean(route));
}

function parseSkillsPayload(rawText: string): SkillRoute[] {
  const payloads: unknown[] = [];

  const trimmed = rawText.trim();
  if (!trimmed) {
    return [];
  }

  const codeBlocks = extractJsonCodeBlocks(rawText);
  if (codeBlocks.length > 0) {
    for (const block of codeBlocks) {
      try {
        payloads.push(JSON.parse(block));
      } catch {
        // ignore malformed blocks
      }
    }
  } else {
    try {
      payloads.push(JSON.parse(trimmed));
    } catch {
      // Plain markdown format (no JSON) is supported below.
    }
  }

  const routes: SkillRoute[] = [];
  for (const payload of payloads) {
    const record = asRecord(payload);
    const list = Array.isArray(record.skills) ? record.skills : [];
    for (const item of list) {
      const normalized = normalizeSkillRoute(item);
      if (normalized) {
        routes.push(normalized);
      }
    }
  }

  if (routes.length > 0) {
    return routes;
  }

  return parseMarkdownSkills(rawText);
}

export function resolveSkillsFilePath(config: PluginConfig, repoPath: string): string {
  if (asString(config.skillsFile)) {
    return path.resolve(config.skillsFile!);
  }
  return path.join(repoPath, ".hiveping", "skills.md");
}

function resolveSkillsFileCandidates(config: PluginConfig, repoPath: string): string[] {
  if (asString(config.skillsFile)) {
    return [path.resolve(config.skillsFile!)];
  }
  return [
    path.join(repoPath, ".hiveping", "skills.md"),
    path.join(repoPath, ".hiveping", "SKILLS.md"),
  ];
}

export async function loadSkillsDocument(
  config: PluginConfig,
  repoPath: string,
): Promise<SkillsDocument | null> {
  for (const filePath of resolveSkillsFileCandidates(config, repoPath)) {
    try {
      const content = await fs.readFile(filePath, "utf8");
      return { filePath, content };
    } catch (error: any) {
      if (error?.code === "ENOENT") {
        continue;
      }
      throw error;
    }
  }
  return null;
}

export async function loadSkillRoutes(config: PluginConfig, repoPath: string): Promise<SkillRoute[]> {
  const document = await loadSkillsDocument(config, repoPath);
  if (!document) {
    return [];
  }
  return parseSkillsPayload(document.content);
}

export function matchSkillRoute(prompt: string, routes: SkillRoute[]): SkillMatchResult | null {
  const normalizedPrompt = prompt.trim();
  if (!normalizedPrompt) {
    return null;
  }

  const lowercasePrompt = normalizedPrompt.toLowerCase();

  for (const route of routes) {
    const anyKeywords = route.match?.any || [];
    for (const keyword of anyKeywords) {
      if (lowercasePrompt.includes(keyword)) {
        return {
          route,
          reason: `matched keyword: ${keyword}`,
        };
      }
    }

    const regexText = route.match?.regex;
    if (regexText) {
      let regex: RegExp;
      try {
        regex = new RegExp(regexText, "i");
      } catch {
        continue;
      }
      const result = regex.exec(normalizedPrompt);
      if (result) {
        return {
          route,
          reason: `matched regex: /${regexText}/i`,
          regexCaptures: result.slice(1),
        };
      }
    }
  }

  return null;
}
