import type { ConversationKeyContext } from "../types.js";

const CONVERSATION_HINT = /(?:^|:)(channel|group|thread|topic|room|space|spaces|conversation|chat|dm|mpim):/i;

function unquote(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

export function normalizeProviderName(channel?: string, channelId?: string): string {
  const raw = (channel || channelId || "unknown").trim().toLowerCase();

  if (raw === "microsoftteams" || raw === "teams") {
    return "msteams";
  }

  return raw || "unknown";
}

export function pickConversationRaw(ctx: ConversationKeyContext): string | undefined {
  const toValue = ctx.to?.trim();
  const fromValue = ctx.from?.trim();

  if (toValue && CONVERSATION_HINT.test(toValue)) return toValue;
  if (fromValue && CONVERSATION_HINT.test(fromValue)) return fromValue;
  if (toValue) return toValue;
  if (fromValue) return fromValue;
  return undefined;
}

export function stripProviderPrefix(rawValue: string | undefined, provider: string): string | undefined {
  if (!rawValue) return undefined;

  const trimmed = rawValue.trim();
  const prefix = `${provider.toLowerCase()}:`;
  if (trimmed.toLowerCase().startsWith(prefix)) {
    return trimmed.slice(prefix.length);
  }

  return trimmed;
}

export function extractTokenAfterLabels(rawValue: string | undefined, labels: string[]): string | undefined {
  if (!rawValue) return undefined;

  const tokens = rawValue
    .split(":")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (labels.includes(tokens[index].toLowerCase())) {
      return tokens[index + 1];
    }
  }

  return undefined;
}

export function extractTrailingToken(rawValue: string | undefined): string | undefined {
  if (!rawValue) return undefined;

  const tokens = rawValue
    .split(":")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (tokens.length === 0) return undefined;
  return tokens[tokens.length - 1];
}

export function threadIdFromContext(messageThreadId: string | number | undefined): string | undefined {
  if (typeof messageThreadId === "string") {
    const trimmed = messageThreadId.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof messageThreadId === "number" && Number.isFinite(messageThreadId)) {
    return String(messageThreadId);
  }

  return undefined;
}

export function encodeKeyPart(rawValue: string | undefined, fallback: string): string {
  const normalized = rawValue?.trim();
  return encodeURIComponent(unquote(normalized && normalized.length > 0 ? normalized : fallback));
}
