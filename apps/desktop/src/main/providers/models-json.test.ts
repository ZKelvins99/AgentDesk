import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getProviderRecord,
  modelsFilePath,
  readModelsFile,
  removeProviderRecord,
  upsertProviderRecord,
  writeModelsFile,
} from './models-json';

describe('models-json（README 4.4 读写）', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'models-json-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('读写与合并：保留其他 provider 与未知顶层字段', () => {
    writeModelsFile(dir, {
      version: 1,
      note: 'user comment field',
      providers: { anthropic: { baseUrl: 'https://api.anthropic.com' } },
    });
    upsertProviderRecord(dir, 'openai', {
      baseUrl: 'https://api.openai.com/v1',
      api: 'openai-completions',
    });
    const data = readModelsFile(dir);
    expect(data.version).toBe(1);
    expect(data.note).toBe('user comment field');
    expect(data.providers.anthropic?.baseUrl).toBe('https://api.anthropic.com');
    expect(data.providers.openai?.api).toBe('openai-completions');
  });

  it('文件不存在时返回空 providers', () => {
    expect(readModelsFile(dir).providers).toEqual({});
  });

  it('remove 删除指定 provider 且幂等', () => {
    upsertProviderRecord(dir, 'x', { baseUrl: 'https://x' });
    expect(removeProviderRecord(dir, 'x')).toBe(true);
    expect(removeProviderRecord(dir, 'x')).toBe(false);
    expect(getProviderRecord(dir, 'x')).toBeUndefined();
  });

  it('JSONC 容错：带 // 注释仍可解析', () => {
    writeFileSync(
      modelsFilePath(dir),
      '{\n  // user comment\n  "providers": { "a": { "baseUrl": "https://a" } }\n}\n',
      'utf8',
    );
    expect(readModelsFile(dir).providers.a?.baseUrl).toBe('https://a');
  });
});
