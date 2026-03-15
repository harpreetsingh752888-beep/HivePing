import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { validateAndResolveRepoPath } from "../../core/path-validation.js";

async function makeTempDir(prefix: string): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

test("validateAndResolveRepoPath resolves repo path when allowedRoots is empty", async () => {
  const dir = await makeTempDir("hiveping-path-");

  try {
    const repoPath = path.join(dir, "repo");
    await fs.mkdir(repoPath, { recursive: true });

    const resolved = await validateAndResolveRepoPath(repoPath, {
      allowedRoots: [],
    });

    assert.equal(resolved, await fs.realpath(repoPath));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("validateAndResolveRepoPath enforces allowedRoots", async () => {
  const dir = await makeTempDir("hiveping-path-");

  try {
    const allowedRoot = path.join(dir, "workspace");
    const disallowedRoot = path.join(dir, "outside");
    const allowedRepo = path.join(allowedRoot, "project-a");
    const disallowedRepo = path.join(disallowedRoot, "project-b");

    await fs.mkdir(allowedRepo, { recursive: true });
    await fs.mkdir(disallowedRepo, { recursive: true });

    const allowed = await validateAndResolveRepoPath(allowedRepo, {
      allowedRoots: [allowedRoot],
    });

    assert.equal(allowed, await fs.realpath(allowedRepo));

    await assert.rejects(
      validateAndResolveRepoPath(disallowedRepo, {
        allowedRoots: [allowedRoot],
      }),
      /outside allowedRoots/,
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("validateAndResolveRepoPath fails when path is missing", async () => {
  const dir = await makeTempDir("hiveping-path-");

  try {
    await assert.rejects(
      validateAndResolveRepoPath(path.join(dir, "missing-repo"), {
        allowedRoots: [],
      }),
      /Bind path does not exist/,
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
