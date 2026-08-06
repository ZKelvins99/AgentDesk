/**
 * 密钥存储（README 8.6.2）：safeStorage 密文 → ~/.agentdesk/secrets.json。
 * - 明文永不落盘；密文含 keyId / provider / createdAt / lastUsedAt。
 * - safeStorage 不可用（部分 Linux 无 keyring）→ 仅内存 + available=false，绝不静默明文落盘。
 * - redact() 统一脱敏：已知明文精确匹配 + sk- 常见前缀正则。
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface SecretEncryptor {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export interface SecretEntry {
  provider: string;
  keyId: string;
  ciphertext: string;
  createdAt: number;
  lastUsedAt: number | null;
}

interface SecretsFile {
  version: 1;
  entries: Record<string, SecretEntry>;
}

const KEY_PREFIX_REGEX = /(sk-[A-Za-z0-9_-]{8,}|api[_-]?key["'\s:=]+[A-Za-z0-9_\-.]{8,})/g;

export class SecretsStore {
  private readonly memory = new Map<string, string>();
  private entries: Record<string, SecretEntry> = {};
  private readonly available: boolean;

  constructor(
    private readonly secretsDir: string,
    private readonly encryptor: SecretEncryptor,
  ) {
    this.available = encryptor.isEncryptionAvailable();
    if (this.available) this.entries = this.load();
  }

  get isEncryptionAvailable(): boolean {
    return this.available;
  }

  get storagePath(): string | null {
    return this.available ? path.join(this.secretsDir, 'secrets.json') : null;
  }

  has(provider: string): boolean {
    return this.memory.has(provider) || this.entries[provider] !== undefined;
  }

  set(provider: string, plaintext: string): void {
    this.memory.set(provider, plaintext);
    if (!this.available) return;
    const entry: SecretEntry = {
      provider,
      keyId: randomUUID(),
      ciphertext: this.encryptor.encryptString(plaintext).toString('base64'),
      createdAt: Date.now(),
      lastUsedAt: null,
    };
    this.entries[provider] = entry;
    this.persist();
  }

  get(provider: string): string | null {
    const mem = this.memory.get(provider);
    if (mem !== undefined) return mem;
    const entry = this.entries[provider];
    if (!entry) return null;
    const plain = this.encryptor.decryptString(Buffer.from(entry.ciphertext, 'base64'));
    this.memory.set(provider, plain);
    entry.lastUsedAt = Date.now();
    this.persist();
    return plain;
  }

  delete(provider: string): void {
    this.memory.delete(provider);
    if (this.entries[provider]) {
      delete this.entries[provider];
      this.persist();
    }
  }

  /** 元数据列表（不含密文与明文，README 8.6.2 展示用） */
  list(): Array<{ provider: string; createdAt: number; lastUsedAt: number | null }> {
    return Object.values(this.entries).map((e) => ({
      provider: e.provider,
      createdAt: e.createdAt,
      lastUsedAt: e.lastUsedAt,
    }));
  }

  /** 统一脱敏：注册过的明文精确匹配 + 常见 key 前缀（README 8.6.2） */
  redact(text: string): string {
    let out = text;
    for (const plain of this.memory.values()) {
      if (plain.length >= 6) out = out.split(plain).join('***');
    }
    out = out.replace(KEY_PREFIX_REGEX, (m) => (m.length > 6 ? `${m.slice(0, 3)}***` : m));
    return out;
  }

  private load(): Record<string, SecretEntry> {
    try {
      const raw = readFileSync(path.join(this.secretsDir, 'secrets.json'), 'utf8');
      const parsed = JSON.parse(raw) as Partial<SecretsFile>;
      return parsed.entries ?? {};
    } catch {
      return {};
    }
  }

  private persist(): void {
    mkdirSync(this.secretsDir, { recursive: true });
    const file = path.join(this.secretsDir, 'secrets.json');
    const tmp = path.join(this.secretsDir, `.secrets.json.${process.pid}.tmp`);
    const payload: SecretsFile = { version: 1, entries: this.entries };
    writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    renameSync(tmp, file);
  }
}
