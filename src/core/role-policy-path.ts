import path from "node:path";
import type { PluginConfig } from "../types.js";

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function resolveRolePolicyDir(
  config: Pick<PluginConfig, "rolePolicyDir">,
  repoPath?: string,
): string | undefined {
  const configured = asString(config.rolePolicyDir);
  if (configured) {
    return path.resolve(configured);
  }

  const repo = asString(repoPath);
  if (!repo) {
    return undefined;
  }

  return path.resolve(repo, ".hiveping/policies");
}
