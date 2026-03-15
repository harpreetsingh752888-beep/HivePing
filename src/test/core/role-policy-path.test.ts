import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { resolveRolePolicyDir } from "../../core/role-policy-path.js";

test("resolveRolePolicyDir prefers configured path", () => {
  const resolved = resolveRolePolicyDir(
    { rolePolicyDir: " .hiveping/policies " },
    "/workspace/YOUR_DIR/account-service",
  );

  assert.equal(resolved, path.resolve(".hiveping/policies"));
});

test("resolveRolePolicyDir falls back to bound project directory", () => {
  const resolved = resolveRolePolicyDir(
    {},
    "/workspace/YOUR_DIR/account-service",
  );

  assert.equal(
    resolved,
    path.resolve("/workspace/YOUR_DIR/account-service/.hiveping/policies"),
  );
});

test("resolveRolePolicyDir returns undefined when no configured path or repo path exists", () => {
  const resolved = resolveRolePolicyDir({});
  assert.equal(resolved, undefined);
});
