import fs from "node:fs/promises";
import path from "node:path";
import type { PluginConfig } from "../types.js";

type PathMappingRule = {
  pattern: RegExp;
  toTargetPrefix: (match: RegExpMatchArray) => string;
};

const BIND_PATH_MAPPINGS: PathMappingRule[] = [
  {
    // OpenClaw workspace mount inside container.
    pattern: /^\/Users\/[^/]+\/\.openclaw\/workspace(?=\/|$)/,
    toTargetPrefix: () => "/home/node/.openclaw/workspace",
  },
  {
    // Generic macOS host path mounted into Docker as /workspace/<dir>.
    // Example: /Users/alex/repos/my-repo -> /workspace/repos/my-repo
    pattern: /^\/Users\/[^/]+\/([^/.][^/]*)(?=\/|$)/,
    toTargetPrefix: (match) => `/workspace/${match[1]}`,
  },
];

function candidateBindPaths(rawPath: string): string[] {
  const trimmed = rawPath.trim();
  const candidates = new Set<string>();
  if (trimmed) {
    candidates.add(trimmed);
  }

  for (const mapping of BIND_PATH_MAPPINGS) {
    const match = trimmed.match(mapping.pattern);
    if (!match) {
      continue;
    }
    const suffix = trimmed.slice(match[0].length);
    candidates.add(`${mapping.toTargetPrefix(match)}${suffix}`);
  }

  return Array.from(candidates);
}

async function resolveExistingDirectory(rawPath: string, label: string): Promise<string> {
  const resolved = path.resolve(rawPath);
  let stat;

  try {
    stat = await fs.stat(resolved);
  } catch {
    throw new Error(`${label} does not exist: ${resolved}`);
  }

  if (!stat.isDirectory()) {
    throw new Error(`${label} is not a directory: ${resolved}`);
  }

  return await fs.realpath(resolved);
}

async function resolveExistingDirectoryFromCandidates(
  rawPath: string,
  label: string,
  candidates: readonly string[],
): Promise<string> {
  const attempted: string[] = [];
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    attempted.push(resolved);
    let stat;
    try {
      stat = await fs.stat(resolved);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) {
      continue;
    }
    return await fs.realpath(resolved);
  }
  const details = attempted.length > 1 ? ` (tried: ${attempted.join(", ")})` : "";
  throw new Error(`${label} does not exist: ${path.resolve(rawPath)}${details}`);
}

function isWithinRoot(candidatePath: string, rootPath: string): boolean {
  return candidatePath === rootPath || candidatePath.startsWith(`${rootPath}${path.sep}`);
}

export async function validateAndResolveRepoPath(rawPath: string, config: PluginConfig): Promise<string> {
  const repoPath = await resolveExistingDirectoryFromCandidates(
    rawPath,
    "Bind path",
    candidateBindPaths(rawPath),
  );
  const allowedRoots = (config.allowedRoots || []).filter((value) => value.trim().length > 0);

  if (allowedRoots.length === 0) {
    return repoPath;
  }

  const resolvedRoots = await Promise.all(allowedRoots.map((root) => resolveExistingDirectory(root, "allowedRoots entry")));
  const insideAllowedRoot = resolvedRoots.some((rootPath) => isWithinRoot(repoPath, rootPath));

  if (!insideAllowedRoot) {
    throw new Error(`Path is outside allowedRoots: ${repoPath}`);
  }

  return repoPath;
}
