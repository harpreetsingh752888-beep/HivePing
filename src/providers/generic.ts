import type { ConversationKeyContext } from "../types.js";
import { encodeKeyPart, pickConversationRaw, threadIdFromContext } from "./shared.js";

export function buildGenericConversationKey(provider: string, context: ConversationKeyContext): string {
  const account = context.accountId?.trim() || "default";
  const conversation = pickConversationRaw(context) || "unknown";
  const threadId = threadIdFromContext(context.messageThreadId);

  return threadId
    ? `${provider}:${encodeKeyPart(account, "default")}:${encodeKeyPart(conversation, "unknown")}:${encodeKeyPart(threadId, "0")}`
    : `${provider}:${encodeKeyPart(account, "default")}:${encodeKeyPart(conversation, "unknown")}`;
}
