import assert from "node:assert/strict";
import test from "node:test";

import { resolveConversationKey } from "../../providers/index.js";

test("resolveConversationKey builds Discord key with optional thread", () => {
  const withThread = resolveConversationKey({
    channel: "discord",
    accountId: "guild-1",
    to: "discord:guild:111:channel:222:thread:333",
  });

  assert.equal(withThread.provider, "discord");
  assert.equal(withThread.key, "discord:111:222:333");

  const withoutThread = resolveConversationKey({
    channel: "discord",
    accountId: "guild-1",
    to: "discord:guild:111:channel:222",
  });

  assert.equal(withoutThread.key, "discord:111:222");
});

test("resolveConversationKey builds Slack key with thread ts", () => {
  const resolved = resolveConversationKey({
    channel: "slack",
    accountId: "team-fallback",
    to: "slack:workspace:T01:channel:C55:thread:1710179822.700000",
  });

  assert.equal(resolved.provider, "slack");
  assert.equal(resolved.key, "slack:T01:C55:1710179822.700000");
});

test("resolveConversationKey normalizes Teams provider alias and encodes conversation ID", () => {
  const resolved = resolveConversationKey({
    channel: "teams",
    accountId: "tenant-fallback",
    to: "msteams:tenant:tenant-88:conversation:19:meeting_abc@thread.tacv2",
  });

  assert.equal(resolved.provider, "msteams");
  assert.equal(resolved.key, "msteams:tenant-88:19%3Ameeting_abc%40thread.tacv2");
});

test("resolveConversationKey falls back to generic key for unknown providers", () => {
  const resolved = resolveConversationKey({
    channel: "matrix",
    accountId: "hs-1",
    to: "room:!abc123:matrix.org",
    messageThreadId: 99,
  });

  assert.equal(resolved.provider, "matrix");
  assert.equal(resolved.key, "matrix:hs-1:room%3A!abc123%3Amatrix.org:99");
});
