import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type SecretEncryptor, SecretsStore } from './secrets-store';

function fakeEncryptor(available = true): SecretEncryptor {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (plain) => Buffer.from(`enc:${plain}`, 'utf8'),
    decryptString: (enc) => Buffer.from(enc).toString('utf8').replace(/^enc:/, ''),
  };
}

describe('SecretsStore（README 8.6.2 密钥不落盘明文）', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'secrets-store-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('roundtrip：密文落盘且文件不含明文', () => {
    const store = new SecretsStore(dir, fakeEncryptor());
    store.set('anthropic', 'sk-ant-123456789');
    expect(store.get('anthropic')).toBe('sk-ant-123456789');
    expect(store.has('anthropic')).toBe(true);
    const raw = readFileSync(path.join(dir, 'secrets.json'), 'utf8');
    expect(raw).not.toContain('sk-ant-123456789');
    const parsed = JSON.parse(raw) as {
      entries: Record<string, { ciphertext: string; keyId: string }>;
    };
    const entry = parsed.entries.anthropic;
    expect(entry).toBeDefined();
    const ciphertext = entry?.ciphertext ?? '';
    expect(ciphertext).toBeTruthy();
    expect(Buffer.from(ciphertext, 'base64').toString('utf8')).toBe('enc:sk-ant-123456789');
    expect(entry?.keyId).toBeTruthy();
  });

  it('不可用时仅内存，绝不落盘', () => {
    const store = new SecretsStore(dir, fakeEncryptor(false));
    expect(store.isEncryptionAvailable).toBe(false);
    expect(store.storagePath).toBeNull();
    store.set('a', 'plain-secret');
    expect(store.get('a')).toBe('plain-secret');
    expect(existsSync(path.join(dir, 'secrets.json'))).toBe(false);
  });

  it('delete 移除密文', () => {
    const store = new SecretsStore(dir, fakeEncryptor());
    store.set('a', 'secret-a');
    store.delete('a');
    expect(store.has('a')).toBe(false);
    expect(store.get('a')).toBeNull();
  });

  it('list 只暴露元数据（不含密文）', () => {
    const store = new SecretsStore(dir, fakeEncryptor());
    store.set('a', 'secret-a');
    const list = store.list();
    expect(list).toEqual([{ provider: 'a', createdAt: expect.any(Number), lastUsedAt: null }]);
    expect(JSON.stringify(list)).not.toContain('secret-a');
  });

  it('redact：已知明文精确匹配 + sk- 前缀正则', () => {
    const store = new SecretsStore(dir, fakeEncryptor());
    store.set('a', 'my-custom-key');
    const out = store.redact('key=my-custom-key and sk-1234567890abcdef');
    expect(out).not.toContain('my-custom-key');
    expect(out).not.toContain('sk-1234567890abcdef');
    expect(out).toContain('***');
  });
});
