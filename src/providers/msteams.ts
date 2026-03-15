import type { ConversationKeyContext } from "../types.js";
import {
  encodeKeyPart,
  extractTokenAfterLabels,
  extractTrailingToken,
  pickConversationRaw,
  stripProviderPrefix,
  threadIdFromContext
} from "./shared.js";

function extractTeamsConversationId(rawValue: string | undefined): string | undefined {
  if (!rawValue) return undefined;

  const trimmed = rawValue.trim();
  const lowered = trimmed.toLowerCase();
  const labels = ["conversation:", "channel:", "chat:", "group:", "room:"];

  for (const label of labels) {
    const index = lowered.indexOf(label);
    if (index >= 0) {
      const value = trimmed.slice(index + label.length).trim();
      if (value) return value;
    }
  }

  if (/^19:.*@thread\./i.test(trimmed)) {
    return trimmed;
  }

  return extractTrailingToken(trimmed);
}

export function buildTeamsConversationKey(context: ConversationKeyContext): string {
  const raw = stripProviderPrefix(pickConversationRaw(context), "msteams");

  const tenantId =
    extractTokenAfterLabels(raw, ["tenant", "org"]) ||
    (context.accountId && context.accountId.trim()) ||
    "default";

  const conversationId = extractTeamsConversationId(raw) || "unknown";
  const threadId = extractTokenAfterLabels(raw, ["thread", "topic"]) || threadIdFromContext(context.messageThreadId);

  return threadId
    ? `msteams:${encodeKeyPart(tenantId, "default")}:${encodeKeyPart(conversationId, "unknown")}:${encodeKeyPart(threadId, "0")}`
    : `msteams:${encodeKeyPart(tenantId, "default")}:${encodeKeyPart(conversationId, "unknown")}`;
}
