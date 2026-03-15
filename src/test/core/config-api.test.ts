import assert from "node:assert/strict";
import test from "node:test";

import { applyApiPolicyToConfig, isActionAllowedByPermissions } from "../../core/config-api.js";

test("isActionAllowedByPermissions maps each govern action", () => {
  const permissions = {
    canBind: false,
    canAsk: true,
    canStatus: true,
    canUnbind: false,
  };

  assert.equal(isActionAllowedByPermissions(permissions, "bind"), false);
  assert.equal(isActionAllowedByPermissions(permissions, "ask"), true);
  assert.equal(isActionAllowedByPermissions(permissions, "status"), true);
  assert.equal(isActionAllowedByPermissions(permissions, "unbind"), false);
});

test("applyApiPolicyToConfig overlays allowed roots and sandbox defaults", () => {
  const base = {
    allowedRoots: ["/workspace/default"],
    defaultSandbox: "read-only" as const,
    defaultApprovalPolicy: "never" as const,
    rolePolicyEnabled: true,
  };

  const merged = applyApiPolicyToConfig(base, {
    allowedRoots: ["/workspace/devStudio"],
    defaultSandbox: "workspace-write",
    defaultApprovalPolicy: "on-request",
    readOnlyCodex: false,
    requireBindingForAsk: true,
    requireProjectMatchForBind: true,
  });

  assert.deepEqual(merged, {
    allowedRoots: ["/workspace/devStudio"],
    defaultSandbox: "workspace-write",
    defaultApprovalPolicy: "on-request",
    rolePolicyEnabled: true,
  });
});

test("applyApiPolicyToConfig enforces read-only Codex mode when requested", () => {
  const merged = applyApiPolicyToConfig(
    {
      defaultSandbox: "workspace-write",
      defaultApprovalPolicy: "on-request",
    },
    {
      allowedRoots: [],
      readOnlyCodex: true,
    },
  );

  assert.equal(merged.defaultSandbox, "read-only");
  assert.equal(merged.defaultApprovalPolicy, "never");
});
