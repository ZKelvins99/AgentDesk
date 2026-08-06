import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProviderManager, type ProviderManagerOptions } from './provider-manager';
import { type SecretEncryptor, SecretsStore } from './secrets-store';

function fakeEncryptor(): SecretEncryptor {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (plain) => Buffer.from(`enc:${plain}`, 'utf8'),
    decryptString: (enc) => Buffer.from(enc).toString('utf8').replace(/^enc:/, ''),
  };
}

describe('ProviderManager（README 8.6）', () => {
  let dir: string;
  let secretsDir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'provider-mgr-'));
    secretsDir = path.join(dir, 'secrets');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function makeManager(overrides: Partial<ProviderManagerOptions> = {}): {
    manager: ProviderManager;
    secrets: SecretsStore;
  } {
    const secrets = new SecretsStore(secretsDir, fakeEncryptor());
    const manager = new ProviderManager({
      modelsDir: dir,
      secrets,
      binary: null,
      ...overrides,
    });
    return { manager, secrets };
  }

  it('list 合并内置目录与自定义 provider', () => {
    const { manager } = makeManager();
    const views = manager.list();
    expect(views.find((v) => v.name === 'anthropic')?.builtin).toBe(true);
    manager.save({
      name: 'my-gw',
      baseUrl: 'https://gw.example/v1',
      authMethod: 'none',
      authHeader: true,
    });
    const my = manager.list().find((v) => v.name === 'my-gw');
    expect(my?.builtin).toBe(false);
    expect(my?.configured).toBe(true);
    expect(my?.baseUrl).toBe('https://gw.example/v1');
  });

  it('save api-key：models.json 只写 $AGENTDESK_KEY_ 引用，密钥密文落盘', () => {
    const { manager } = makeManager();
    manager.save(
      {
        name: 'deepseek',
        baseUrl: 'https://api.deepseek.com/v1',
        authMethod: 'api-key',
        authHeader: true,
      },
      'sk-ds-123456',
    );
    const record = JSON.parse(readFileSync(path.join(dir, 'models.json'), 'utf8')).providers
      .deepseek as {
      apiKey: string;
      baseUrl: string;
    };
    expect(record.apiKey).toBe('$AGENTDESK_KEY_DEEPSEEK');
    expect(record.baseUrl).toBe('https://api.deepseek.com/v1');
    expect(manager.envForProvider('deepseek')).toEqual({ AGENTDESK_KEY_DEEPSEEK: 'sk-ds-123456' });
    const secretsRaw = readFileSync(path.join(secretsDir, 'secrets.json'), 'utf8');
    expect(secretsRaw).not.toContain('sk-ds-123456');
  });

  it('authMethod none：本地占位 key 写入 models.json', () => {
    const { manager } = makeManager();
    manager.save({ name: 'ollama', baseUrl: 'http://localhost:11434/v1', authMethod: 'none' });
    const record = JSON.parse(readFileSync(path.join(dir, 'models.json'), 'utf8')).providers
      .ollama as {
      apiKey: string;
    };
    expect(record.apiKey).toBe('local');
    expect(manager.envForProvider('ollama')).toEqual({});
  });

  it('自定义 provider 无 baseUrl 抛错；env 方式无引用抛错', () => {
    const { manager } = makeManager();
    expect(() => manager.save({ name: 'x', authMethod: 'api-key' })).toThrow();
    expect(() => manager.save({ name: 'y', authMethod: 'env' })).toThrow();
  });

  it('delete 同时移除 models.json 条目与密钥', () => {
    const { manager } = makeManager();
    manager.save(
      { name: 'openai', baseUrl: 'https://api.openai.com/v1', authMethod: 'api-key' },
      'sk-o-1',
    );
    manager.delete('openai');
    expect(manager.list().find((v) => v.name === 'openai')?.configured).toBe(false);
    expect(manager.secretsStatus().entries).toEqual([]);
  });

  it('discoverModels：解析 OpenAI 兼容 /models 并规范化 baseUrl', async () => {
    const fetchImpl = async (url: string | URL | Request): Promise<Response> => {
      expect(String(url)).toBe('http://localhost:9/models');
      return new Response(
        JSON.stringify({ object: 'list', data: [{ id: 'm1' }, { id: 'm2', name: 'M2' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };
    const { manager } = makeManager({ fetchImpl: fetchImpl as typeof fetch });
    const models = await manager.discoverModels({ baseUrl: 'http://localhost:9/v1' });
    expect(models).toEqual([
      { id: 'm1', name: null },
      { id: 'm2', name: 'M2' },
    ]);
  });

  it('testProvider：连通成功返回状态与延迟，错误被脱敏', async () => {
    const fetchImpl = async (
      url: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      if (String(url).endsWith('/chat/completions')) {
        const body = JSON.parse(String(init?.body)) as { model: string };
        expect(body.model).toBe('m1');
        return new Response(JSON.stringify({ id: 'x' }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    };
    const { manager } = makeManager({ fetchImpl: fetchImpl as typeof fetch });
    manager.save(
      { name: 'mockp', baseUrl: 'http://localhost:1/v1', authMethod: 'api-key', authHeader: true },
      'sk-test-secret-999',
    );
    const res = await manager.testProvider('mockp', 'm1');
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(res.latencyMs).toBeGreaterThanOrEqual(0);
    expect(res.snippet).not.toContain('sk-test-secret-999');
  });

  it('authStatus：AgentDesk 密钥直接判定已配置，不探测 pi', async () => {
    const { manager } = makeManager();
    manager.save(
      { name: 'openai', baseUrl: 'https://api.openai.com/v1', authMethod: 'api-key' },
      'sk-test-123',
    );
    const status = await manager.authStatus();
    expect(status.find((s) => s.name === 'openai')).toEqual({
      name: 'openai',
      type: 'api_key',
      configured: true,
      via: 'agentdesk',
    });
  });
});
