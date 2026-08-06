/**
 * pi models.json 读写（README 4.4 / 8.6.1）。
 * 原则：读-改-写，绝不覆盖用户手写内容与其他 provider；原子写（tmp + rename）。
 * 路径：<PI_CODING_AGENT_DIR 或 ~/.pi/agent>/models.json
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

export interface ModelsFile {
  /** 保留未知顶层字段，避免破坏用户手写内容 */
  [key: string]: unknown;
  providers: Record<string, ProviderRecord>;
}

export interface ProviderRecord {
  baseUrl?: string;
  api?: string;
  apiKey?: string;
  oauth?: string;
  authHeader?: boolean;
  headers?: Record<string, string>;
  compat?: {
    supportsDeveloperRole?: boolean;
    supportsReasoningEffort?: boolean;
  };
  models?: Array<Record<string, unknown>>;
  modelOverrides?: Record<string, unknown>;
}

export function defaultModelsDir(): string {
  return process.env.PI_CODING_AGENT_DIR ?? path.join(homedir(), '.pi', 'agent');
}

export function modelsFilePath(modelsDir: string): string {
  return path.join(modelsDir, 'models.json');
}

export function readModelsFile(modelsDir: string): ModelsFile {
  const file = modelsFilePath(modelsDir);
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return { providers: {} };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ModelsFile>;
    return { ...parsed, providers: parsed.providers ?? {} };
  } catch {
    // JSONC 容错：剥掉注释后重试（README 16.2 ConfigStore 原则）
    const stripped = raw
      .split(/\r?\n/)
      .map((l) => l.replace(/(^|\s)\/\/.*$/, '$1'))
      .join('\n');
    try {
      const parsed = JSON.parse(stripped) as Partial<ModelsFile>;
      return { ...parsed, providers: parsed.providers ?? {} };
    } catch {
      return { providers: {} };
    }
  }
}

export function writeModelsFile(modelsDir: string, data: ModelsFile): void {
  mkdirSync(modelsDir, { recursive: true });
  const file = modelsFilePath(modelsDir);
  const tmp = path.join(modelsDir, `.models.json.${process.pid}.tmp`);
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  renameSync(tmp, file);
}

export function getProviderRecord(modelsDir: string, name: string): ProviderRecord | undefined {
  return readModelsFile(modelsDir).providers[name];
}

export function upsertProviderRecord(
  modelsDir: string,
  name: string,
  record: ProviderRecord,
): ModelsFile {
  const data = readModelsFile(modelsDir);
  data.providers = {
    ...data.providers,
    [name]: { ...(data.providers[name] ?? {}), ...record },
  };
  writeModelsFile(modelsDir, data);
  return data;
}

export function removeProviderRecord(modelsDir: string, name: string): boolean {
  const data = readModelsFile(modelsDir);
  if (!(name in data.providers)) return false;
  const next = { ...data.providers };
  delete next[name];
  writeModelsFile(modelsDir, { ...data, providers: next });
  return true;
}
