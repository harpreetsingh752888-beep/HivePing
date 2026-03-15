import type { ConversationKeyContext } from "../types.js";
import { buildDiscordConversationKey } from "./discord.js";
import { buildGenericConversationKey } from "./generic.js";
import { buildTeamsConversationKey } from "./msteams.js";
import { buildSlackConversationKey } from "./slack.js";
import { normalizeProviderName } from "./shared.js";

export type ConversationKeyResolution = {
  provider: string;
  key: string;
};

export function resolveConversationKey(context: ConversationKeyContext): ConversationKeyResolution {
  const provider = normalizeProviderName(context.channel, context.channelId);

  switch (provider) {
    case "discord":
      return { provider, key: buildDiscordConversationKey(context) };
    case "slack":
      return { provider, key: buildSlackConversationKey(context) };
    case "msteams":
      return { provider, key: buildTeamsConversationKey(context) };
    default:
      return { provider, key: buildGenericConversationKey(provider, context) };
  }
}
