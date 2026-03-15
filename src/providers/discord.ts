import type { ConversationKeyContext } from "../types.js";
import {
  encodeKeyPart,
  extractTokenAfterLabels,
  extractTrailingToken,
  pickConversationRaw,
  stripProviderPrefix,
  threadIdFromContext
} from "./shared.js";

export function buildDiscordConversationKey(context: ConversationKeyContext): string {
  const raw = stripProviderPrefix(pickConversationRaw(context), "discord");

  const guildId =
    extractTokenAfterLabels(raw, ["guild", "server"]) ||
    (context.accountId && context.accountId.trim()) ||
    "default";

  const channelId =
    extractTokenAfterLabels(raw, ["channel", "group", "room"]) ||
    extractTrailingToken(raw) ||
    "unknown";

  const threadId = extractTokenAfterLabels(raw, ["thread"]) || threadIdFromContext(context.messageThreadId);

  return threadId
    ? `discord:${encodeKeyPart(guildId, "default")}:${encodeKeyPart(channelId, "unknown")}:${encodeKeyPart(threadId, "0")}`
    : `discord:${encodeKeyPart(guildId, "default")}:${encodeKeyPart(channelId, "unknown")}`;
}
