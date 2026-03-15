import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  loadManagedRuntimeConfig,
  loadManagedRuntimeConfigSync,
  updateManagedRuntimeConfig,
} from "../../core/runtime-config.js";

async function makeTempDir(prefix: string): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

test("loadManagedRuntimeConfig returns empty object for missing/invalid files", async () => {
  const dir = await makeTempDir("hiveping-runtime-");

  try {
    const filePath = path.join(dir, "runtime-config.json");

    assert.deepEqual(loadManagedRuntimeConfigSync(filePath), {});
    assert.deepEqual(await loadManagedRuntimeConfig(filePath), {});

    await fs.writeFile(filePath, "{not-json", "utf8");

    assert.deepEqual(loadManagedRuntimeConfigSync(filePath), {});
    assert.deepEqual(await loadManagedRuntimeConfig(filePath), {});
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("updateManagedRuntimeConfig writes and normalizes managed keys", async () => {
  const dir = await makeTempDir("hiveping-runtime-");

  try {
    const filePath = path.join(dir, "runtime-config.json");

    const updated = await updateManagedRuntimeConfig(filePath, {
      reasoningCommand: "codex",
      reasoningArgs: ["mcp-server"],
      reasoningToolName: "codex",
      defaultModel: "gpt-5.4",
      defaultProfile: "dev",
      rolePolicyEnabled: true,
      rolePolicyDir: "/workspace/devStudio/.hiveping/policies",
      skillsFile: "/workspace/devStudio/account-service/.hiveping/skills.md",
      skillsMode: "agent",
      approvalRequestsFile: "/workspace/devStudio/.hiveping/approval-requests.json",
      changeSandbox: "workspace-write",
      changeApprovalPolicy: "on-request",
      actionWebhookUrl: "https://hooks.example.com/hiveping",
      actionWebhookToken: "token-abc",
      actionWebhookTimeoutMs: 9000,
    });

    assert.deepEqual(updated, {
      reasoningCommand: "codex",
      reasoningArgs: ["mcp-server"],
      reasoningToolName: "codex",
      defaultModel: "gpt-5.4",
      defaultProfile: "dev",
      rolePolicyEnabled: true,
      rolePolicyDir: "/workspace/devStudio/.hiveping/policies",
      skillsFile: "/workspace/devStudio/account-service/.hiveping/skills.md",
      skillsMode: "agent",
      approvalRequestsFile: "/workspace/devStudio/.hiveping/approval-requests.json",
      changeSandbox: "workspace-write",
      changeApprovalPolicy: "on-request",
      actionWebhookUrl: "https://hooks.example.com/hiveping",
      actionWebhookToken: "token-abc",
      actionWebhookTimeoutMs: 9000,
    });

    const loaded = await loadManagedRuntimeConfig(filePath);
    assert.deepEqual(loaded, updated);

    await fs.writeFile(
      filePath,
      JSON.stringify(
        {
          reasoningCommand: " codex-alt ",
          reasoningArgs: [" mcp-server ", "", " --stdio "],
          reasoningToolName: " assistant ",
          defaultModel: " gpt-5-mini ",
          defaultProfile: " fast ",
          rolePolicyEnabled: true,
          rolePolicyDir: " /workspace/devStudio/.hiveping/policies ",
          skillsFile: " /workspace/devStudio/account-service/.hiveping/skills.md ",
          skillsMode: "smart-agent",
          approvalRequestsFile: "",
          changeSandbox: "read-only",
          changeApprovalPolicy: "sometimes",
          actionWebhookUrl: " https://hooks.example.com/abc ",
          actionWebhookToken: " ",
          actionWebhookTimeoutMs: 200,
        },
        null,
        2,
      ),
      "utf8",
    );

    assert.deepEqual(await loadManagedRuntimeConfig(filePath), {
      reasoningCommand: "codex-alt",
      reasoningArgs: ["mcp-server", "--stdio"],
      reasoningToolName: "assistant",
      defaultModel: "gpt-5-mini",
      defaultProfile: "fast",
      rolePolicyEnabled: true,
      rolePolicyDir: "/workspace/devStudio/.hiveping/policies",
      skillsFile: "/workspace/devStudio/account-service/.hiveping/skills.md",
      actionWebhookUrl: "https://hooks.example.com/abc",
    });

    await fs.writeFile(
      filePath,
      JSON.stringify(
        {
          reasoningCommand: "codex",
          rolePolicyEnabled: true,
          skillsMode: "agent",
        },
        null,
        2,
      ),
      "utf8",
    );

    assert.deepEqual(await loadManagedRuntimeConfig(filePath), {
      reasoningCommand: "codex",
      rolePolicyEnabled: true,
      skillsMode: "agent",
    });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
