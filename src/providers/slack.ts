import type { ConversationKeyContext } from "../types.js";
import {
  encodeKeyPart,
  extractTokenAfterLabels,
  extractTrailingToken,
  pickConversationRaw,
  stripProviderPrefix,
  threadIdFromContext
} from "./shared.js";

export function buildSlackConversationKey(context: ConversationKeyContext): string {
  const raw = stripProviderPrefix(pickConversationRaw(context), "slack");

  const teamId =
    extractTokenAfterLabels(raw, ["team", "workspace"]) ||
    (context.accountId && context.accountId.trim()) ||
    "default";

  const channelId =
    extractTokenAfterLabels(raw, ["channel", "group", "room", "mpim", "dm"]) ||
    extractTrailingToken(raw) ||
    "unknown";

  const threadTs =
    extractTokenAfterLabels(raw, ["thread", "threadts", "ts"]) || threadIdFromContext(context.messageThreadId);

  return threadTs
    ? `slack:${encodeKeyPart(teamId, "default")}:${encodeKeyPart(channelId, "unknown")}:${encodeKeyPart(threadTs, "0")}`
    : `slack:${encodeKeyPart(teamId, "default")}:${encodeKeyPart(channelId, "unknown")}`;
}
