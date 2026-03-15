import fs from "node:fs/promises";
import path from "node:path";
import type { BindingFile, BindingMetadata, ConversationBinding } from "../types.js";

function sanitizeMetadata(raw: unknown): BindingMetadata | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }

  const metadata: BindingMetadata = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string") {
      metadata[key] = value;
    }
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function copyBinding(binding: ConversationBinding): ConversationBinding {
  return {
    repoPath: binding.repoPath,
    metadata: binding.metadata ? { ...binding.metadata } : undefined,
    provider: binding.provider,
    updatedAt: binding.updatedAt
  };
}

export class BindingStore {
  private bindings = new Map<string, ConversationBinding>();
  private loaded = false;
  private loadPromise: Promise<void> | null = null;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;

    if (!this.loadPromise) {
      this.loadPromise = this.loadFromDisk().finally(() => {
        this.loaded = true;
      });
    }

    await this.loadPromise;
  }

  private async loadFromDisk(): Promise<void> {
    let raw: string;

    try {
      raw = await fs.readFile(this.filePath, "utf8");
    } catch (error: any) {
      if (error?.code === "ENOENT") return;
      throw error;
    }

    let parsed: BindingFile | null = null;
    try {
      parsed = JSON.parse(raw) as BindingFile;
    } catch {
      return;
    }

    if (!parsed || typeof parsed !== "object" || typeof parsed.bindings !== "object" || !parsed.bindings) {
      return;
    }

    for (const [conversationKey, value] of Object.entries(parsed.bindings)) {
      if (!value || typeof value.repoPath !== "string") continue;

      this.bindings.set(conversationKey, {
        repoPath: value.repoPath,
        metadata: sanitizeMetadata(value.metadata),
        provider: typeof value.provider === "string" ? value.provider : "unknown",
        updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString()
      });
    }
  }

  private async persist(): Promise<void> {
    const payload: BindingFile = {
      version: 1,
      bindings: Object.fromEntries(Array.from(this.bindings.entries()).map(([key, value]) => [key, copyBinding(value)]))
    };

    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    await fs.rename(tempPath, this.filePath);
  }

  private queuePersist(): Promise<void> {
    const writePromise = this.writeChain.then(() => this.persist());
    this.writeChain = writePromise.catch(() => {});
    return writePromise;
  }

  async get(conversationKey: string): Promise<ConversationBinding | undefined> {
    await this.ensureLoaded();
    const binding = this.bindings.get(conversationKey);
    return binding ? copyBinding(binding) : undefined;
  }

  async set(conversationKey: string, binding: ConversationBinding): Promise<void> {
    await this.ensureLoaded();
    this.bindings.set(conversationKey, copyBinding(binding));
    await this.queuePersist();
  }

  async delete(conversationKey: string): Promise<boolean> {
    await this.ensureLoaded();
    const removed = this.bindings.delete(conversationKey);
    if (removed) {
      await this.queuePersist();
    }
    return removed;
  }
}
