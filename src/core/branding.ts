import path from "node:path";

export const PLUGIN_ID = "hiveping";
export const PLUGIN_NAME = "HivePing";
export const PLUGIN_VERSION = "0.1.0";

export const PRIMARY_MENTION_ALIAS = ["@hiveping"];
export const DEFAULT_MENTION_ALIASES = [...PRIMARY_MENTION_ALIAS] as const;

export const PRIMARY_STORAGE_DIR = ".hiveping";

export function primaryStoragePath(fileName: string): string {
  return path.posix.join(PRIMARY_STORAGE_DIR, fileName);
}
