import fs from "node:fs/promises";
import path from "node:path";

export type HistoryRole = "user" | "assistant";

export type ConversationHistoryEntry = {
  role: HistoryRole;
  content: string;
  at: string;
};

type ConversationHistory = {
  updatedAt: string;
  entries: ConversationHistoryEntry[];
};

type HistoryFile = {
  version: 1;
  conversations: Record<string, ConversationHistory>;
};

function sanitizeHistoryRole(value: unknown): HistoryRole | undefined {
  if (value === "user" || value === "assistant") {
    return value;
  }
  return undefined;
}

function sanitizeEntry(raw: unknown): ConversationHistoryEntry | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }

  const value = raw as Record<string, unknown>;
  const role = sanitizeHistoryRole(value.role);
  const content = typeof value.content === "string" ? value.content.trim() : "";
  const at = typeof value.at === "string" && value.at.trim().length > 0 ? value.at : new Date().toISOString();

  if (!role || content.length === 0) {
    return undefined;
  }

  return {
    role,
    content,
    at,
  };
}

function copyEntry(entry: ConversationHistoryEntry): ConversationHistoryEntry {
  return {
    role: entry.role,
    content: entry.content,
    at: entry.at,
  };
}

function truncateText(value: string, maxLength = 8_000): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}\n...[truncated]`;
}

export class HistoryStore {
  private conversations = new Map<string, ConversationHistory>();
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

    let parsed: HistoryFile | null = null;
    try {
      parsed = JSON.parse(raw) as HistoryFile;
    } catch {
      return;
    }

    if (!parsed || typeof parsed !== "object" || typeof parsed.conversations !== "object" || !parsed.conversations) {
      return;
    }

    for (const [conversationKey, conversationRaw] of Object.entries(parsed.conversations)) {
      if (!conversationRaw || typeof conversationRaw !== "object") continue;

      const value = conversationRaw as Record<string, unknown>;
      const entries = Array.isArray(value.entries)
        ? value.entries
            .map((entry) => sanitizeEntry(entry))
            .filter((entry): entry is ConversationHistoryEntry => Boolean(entry))
        : [];

      this.conversations.set(conversationKey, {
        updatedAt:
          typeof value.updatedAt === "string" && value.updatedAt.trim().length > 0
            ? value.updatedAt
            : new Date().toISOString(),
        entries,
      });
    }
  }

  private async persist(): Promise<void> {
    const payload: HistoryFile = {
      version: 1,
      conversations: Object.fromEntries(
        Array.from(this.conversations.entries()).map(([conversationKey, conversation]) => [
          conversationKey,
          {
            updatedAt: conversation.updatedAt,
            entries: conversation.entries.map((entry) => copyEntry(entry)),
          },
        ]),
      ),
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

  async recent(conversationKey: string, maxEntries: number): Promise<ConversationHistoryEntry[]> {
    await this.ensureLoaded();

    const conversation = this.conversations.get(conversationKey);
    if (!conversation || conversation.entries.length === 0) {
      return [];
    }

    const normalizedLimit = Number.isFinite(maxEntries) ? Math.max(1, Math.floor(maxEntries)) : 30;
    return conversation.entries.slice(-normalizedLimit).map((entry) => copyEntry(entry));
  }

  async load(conversationKey: string): Promise<ConversationHistoryEntry[]> {
    await this.ensureLoaded();

    const conversation = this.conversations.get(conversationKey);
    if (!conversation || conversation.entries.length === 0) {
      return [];
    }

    return conversation.entries.map((entry) => copyEntry(entry));
  }

  async append(params: {
    conversationKey: string;
    role: HistoryRole;
    content: string;
    maxEntries: number;
  }): Promise<void> {
    await this.ensureLoaded();

    const content = params.content.trim();
    if (!content) {
      return;
    }

    const existing = this.conversations.get(params.conversationKey) || {
      updatedAt: new Date().toISOString(),
      entries: [],
    };

    const normalizedLimit = Number.isFinite(params.maxEntries)
      ? Math.max(2, Math.floor(params.maxEntries))
      : 30;

    existing.entries.push({
      role: params.role,
      content: truncateText(content),
      at: new Date().toISOString(),
    });

    if (existing.entries.length > normalizedLimit) {
      existing.entries = existing.entries.slice(-normalizedLimit);
    }

    existing.updatedAt = new Date().toISOString();
    this.conversations.set(params.conversationKey, existing);
    await this.queuePersist();
  }

  async clear(conversationKey: string): Promise<void> {
    await this.ensureLoaded();

    if (!this.conversations.delete(conversationKey)) {
      return;
    }

    await this.queuePersist();
  }
}
