/**
 * ProviderManager（README 8.6）：
 * - 合并内置目录 + models.json 配置 + 密钥状态 → ProviderView
 * - 保存/删除 provider（密钥走 SecretsStore，models.json 只写 $AGENTDESK_KEY_<NAME> 引用）
 * - spawn 最小暴露：只解密当前 provider 的 key 注入 env
 * - 模型自动发现 / 连通性测试 / auth 登录态探测 / 系统终端 OAuth 引导
 */
import { execFile, spawn } from 'node:child_process';
import { AgentDeskError } from '@agentdesk/shared';
import { BUILTIN_PROVIDERS, builtinProvider } from './catalog';
import {
  getProviderRecord,
  type ProviderRecord,
  readModelsFile,
  removeProviderRecord,
  upsertProviderRecord,
} from './models-json';
import { PROVIDER_PRESETS, type ProviderPreset } from './presets';
import type { SecretsStore } from './secrets-store';
import type { ProviderApi, ProviderAuthMethod, ProviderConfigInput, ProviderView } from './types';

export interface ProviderManagerOptions {
  modelsDir: string;
  secrets: SecretsStore;
  /** pi 二进制绝对路径；为 null 时 auth 探测 / 登录桥不可用 */
  binary: string | null;
  fetchImpl?: typeof fetch;
  execFileImpl?: typeof execFile;
}

export interface DiscoverModelsInput {
  baseUrl: string;
  api?: string | undefined;
  apiKey?: string | undefined;
  headers?: Record<string, string> | undefined;
}

export interface DiscoveredModel {
  id: string;
  name: string | null;
}

export interface ProviderTestResult {
  ok: boolean;
  status: number | null;
  latencyMs: number | null;
  snippet: string | null;
  error: string | null;
}

export interface AuthProviderStatus {
  name: string;
  type: 'api_key' | 'oauth' | 'none';
  configured: boolean;
  via: 'agentdesk' | 'pi-auth';
}

/** "openai-codex" → "OPENAI_CODEX"（README 8.6.2 env 命名） */
export function keyEnvName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function authMethodOf(
  record: ProviderRecord | undefined,
  fallback: ProviderAuthMethod,
): ProviderAuthMethod {
  if (record?.oauth) return 'oauth';
  const key = record?.apiKey;
  if (key?.startsWith('$AGENTDESK_KEY_')) return 'api-key';
  if (key?.startsWith('$')) return 'env';
  if (key?.startsWith('!')) return 'shell';
  if (key === 'local') return 'none';
  return fallback;
}

function normalizeModels(
  records: Array<Record<string, unknown>> | undefined,
): ProviderView['models'] {
  return (records ?? [])
    .map((m) => {
      const id = typeof m.id === 'string' ? m.id : '';
      if (!id) return null;
      return {
        id,
        ...(m.name !== undefined ? { name: String(m.name) } : {}),
        ...(typeof m.api === 'string' ? { api: m.api as ProviderApi } : {}),
        ...(typeof m.reasoning === 'boolean' ? { reasoning: m.reasoning } : {}),
        ...(Array.isArray(m.input) ? { input: m.input as Array<'text' | 'image'> } : {}),
        ...(typeof m.contextWindow === 'number' ? { contextWindow: m.contextWindow } : {}),
        ...(typeof m.maxTokens === 'number' ? { maxTokens: m.maxTokens } : {}),
        ...(m.cost !== undefined ? { cost: m.cost as ProviderView['models'][number]['cost'] } : {}),
        ...(m.thinkingLevelMap !== undefined
          ? { thinkingLevelMap: m.thinkingLevelMap as Record<string, string | null> }
          : {}),
        ...(m.compat !== undefined
          ? { compat: m.compat as ProviderView['models'][number]['compat'] }
          : {}),
      };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);
}

function normalizeBaseUrl(baseUrl: string): string {
  let u = baseUrl.trim().replace(/\/+$/, '');
  if (u.endsWith('/v1')) u = u.slice(0, -3);
  return u;
}

export class ProviderManager {
  private readonly modelsDir: string;
  private readonly secrets: SecretsStore;
  private readonly binary: string | null;
  private readonly fetchImpl: typeof fetch;
  private readonly execFileImpl: typeof execFile;

  constructor(options: ProviderManagerOptions) {
    this.modelsDir = options.modelsDir;
    this.secrets = options.secrets;
    this.binary = options.binary;
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
    this.execFileImpl = options.execFileImpl ?? execFile;
  }

  presets(): ProviderPreset[] {
    return PROVIDER_PRESETS;
  }

  list(): ProviderView[] {
    const configured = readModelsFile(this.modelsDir).providers;
    const names = new Set<string>([
      ...BUILTIN_PROVIDERS.map((p) => p.name),
      ...Object.keys(configured),
    ]);
    return [...names].sort().map((name) => this.viewOf(name, configured[name]));
  }

  viewOf(name: string, record?: ProviderRecord): ProviderView {
    const builtin = builtinProvider(name);
    const authMethod = authMethodOf(record, builtin?.authMethod ?? 'api-key');
    const compat: ProviderView['compat'] = {};
    if (record?.compat?.supportsDeveloperRole !== undefined) {
      compat.supportsDeveloperRole = record.compat.supportsDeveloperRole;
    }
    if (record?.compat?.supportsReasoningEffort !== undefined) {
      compat.supportsReasoningEffort = record.compat.supportsReasoningEffort;
    }
    return {
      name,
      builtin: builtin !== undefined,
      configured: record !== undefined,
      baseUrl: record?.baseUrl ?? builtin?.baseUrl ?? null,
      api: (record?.api ?? builtin?.api ?? null) as ProviderApi | null,
      authMethod,
      apiKeyRef: record?.apiKey ?? null,
      hasSecret: authMethod === 'api-key' && this.secrets.has(name),
      authHeader: record?.authHeader ?? true,
      headers: record?.headers ?? {},
      compat,
      models: normalizeModels(record?.models),
    };
  }

  save(config: ProviderConfigInput, apiKey?: string): void {
    const name = config.name.trim();
    if (!name) {
      throw new AgentDeskError({
        code: 'INVALID_PROVIDER_CONFIG',
        scope: 'provider',
        userMessage: 'Provider 名称不能为空',
      });
    }
    const builtin = builtinProvider(name);
    if (!builtin && !config.baseUrl) {
      throw new AgentDeskError({
        code: 'INVALID_PROVIDER_CONFIG',
        scope: 'provider',
        userMessage: '自定义 Provider 必须填写 Base URL',
      });
    }
    const existing = getProviderRecord(this.modelsDir, name) ?? {};
    const next: ProviderRecord = { ...existing };
    if (config.baseUrl) next.baseUrl = config.baseUrl;
    if (config.api) next.api = config.api;
    if (config.authHeader !== undefined) next.authHeader = config.authHeader;
    if (config.headers && Object.keys(config.headers).length > 0) next.headers = config.headers;
    if (config.compat) {
      const nextCompat: NonNullable<typeof next.compat> = {};
      if (config.compat.supportsDeveloperRole !== undefined) {
        nextCompat.supportsDeveloperRole = config.compat.supportsDeveloperRole;
      }
      if (config.compat.supportsReasoningEffort !== undefined) {
        nextCompat.supportsReasoningEffort = config.compat.supportsReasoningEffort;
      }
      next.compat = nextCompat;
    }
    if (config.models && config.models.length > 0) {
      next.models = config.models as Array<Record<string, unknown>>;
    }

    switch (config.authMethod) {
      case 'api-key': {
        if (apiKey !== undefined && apiKey.length > 0) {
          this.secrets.set(name, apiKey);
          next.apiKey = `$AGENTDESK_KEY_${keyEnvName(name)}`;
        }
        delete next.oauth;
        break;
      }
      case 'env': {
        const ref = config.apiKeyRef?.trim();
        if (!ref) {
          throw new AgentDeskError({
            code: 'INVALID_PROVIDER_CONFIG',
            scope: 'provider',
            userMessage: '环境变量方式需要填写变量引用（如 $MY_KEY）',
          });
        }
        next.apiKey = ref;
        delete next.oauth;
        break;
      }
      case 'shell': {
        const ref = config.apiKeyRef?.trim();
        if (!ref) {
          throw new AgentDeskError({
            code: 'INVALID_PROVIDER_CONFIG',
            scope: 'provider',
            userMessage: 'Shell 命令方式需要填写命令（如 !op read ...）',
          });
        }
        next.apiKey = ref;
        delete next.oauth;
        break;
      }
      case 'none': {
        // README 4.5：pi 要求"有 auth 才出现在 /model"，本地无密钥服务填占位 key
        next.apiKey = 'local';
        delete next.oauth;
        break;
      }
      case 'oauth': {
        next.oauth = 'radius';
        delete next.apiKey;
        break;
      }
    }
    upsertProviderRecord(this.modelsDir, name, next);
  }

  delete(name: string): void {
    removeProviderRecord(this.modelsDir, name);
    this.secrets.delete(name);
  }

  /** spawn 最小暴露：只返回当前 provider 的密钥 env（README 8.6.2） */
  envForProvider(name: string): Record<string, string> {
    if (!this.secrets.has(name)) return {};
    const key = this.secrets.get(name);
    if (!key) return {};
    return { [`AGENTDESK_KEY_${keyEnvName(name)}`]: key };
  }

  secretsStatus(): {
    available: boolean;
    storagePath: string | null;
    entries: Array<{ provider: string; createdAt: number; lastUsedAt: number | null }>;
  } {
    return {
      available: this.secrets.isEncryptionAvailable,
      storagePath: this.secrets.storagePath,
      entries: this.secrets.list(),
    };
  }

  redact(text: string): string {
    return this.secrets.redact(text);
  }

  async discoverModels(input: DiscoverModelsInput): Promise<DiscoveredModel[]> {
    const base = normalizeBaseUrl(input.baseUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6_000);
    try {
      const res = await this.fetchImpl(`${base}/models`, {
        method: 'GET',
        headers: {
          ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {}),
          ...(input.headers ?? {}),
        },
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new AgentDeskError({
          code: 'PROVIDER_DISCOVER_FAILED',
          scope: 'provider',
          userMessage: `GET /models 返回 ${res.status}`,
        });
      }
      const body = (await res.json()) as {
        data?: Array<{ id?: unknown; name?: unknown }>;
        models?: Array<{ id?: unknown; name?: unknown }>;
      };
      const list = body.data ?? body.models ?? [];
      return list
        .filter((m) => typeof m.id === 'string')
        .map((m) => ({ id: m.id as string, name: typeof m.name === 'string' ? m.name : null }));
    } finally {
      clearTimeout(timer);
    }
  }

  async testProvider(name: string, model?: string): Promise<ProviderTestResult> {
    const record = getProviderRecord(this.modelsDir, name);
    const builtin = builtinProvider(name);
    const baseUrl = record?.baseUrl ?? builtin?.baseUrl;
    if (!baseUrl) {
      return { ok: false, status: null, latencyMs: null, snippet: null, error: '未配置 Base URL' };
    }
    const modelId = model ?? record?.models?.[0]?.id ?? 'ping';
    const apiKey = this.resolveKeyForTest(name, record);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    const started = performance.now();
    try {
      const res = await this.fetchImpl(`${normalizeBaseUrl(baseUrl)}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          ...(record?.headers ?? {}),
        },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
          stream: false,
        }),
        signal: controller.signal,
      });
      const text = await res.text();
      return {
        ok: res.ok,
        status: res.status,
        latencyMs: Math.round(performance.now() - started),
        snippet: this.redact(text.slice(0, 200)),
        error: null,
      };
    } catch (err) {
      return {
        ok: false,
        status: null,
        latencyMs: Math.round(performance.now() - started),
        snippet: null,
        error: this.redact(err instanceof Error ? err.message : String(err)),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private resolveKeyForTest(name: string, record: ProviderRecord | undefined): string | null {
    if (!record?.apiKey) return null;
    const ref = record.apiKey;
    if (ref.startsWith('$AGENTDESK_KEY_')) {
      return this.secrets.get(name) ?? process.env[ref.slice(1)] ?? null;
    }
    if (ref.startsWith('$')) {
      const envName = ref.replace(/^\$\{?/, '').replace(/\}$/, '');
      return process.env[envName] ?? null;
    }
    if (ref.startsWith('!') || ref === 'local') return null;
    return ref;
  }

  /**
   * auth 登录态（README 8.6.5）：AgentDesk 密钥 → via agentdesk；
   * 其余只探测「已在 models.json 配置过」的 provider（避免为 38 个内置各起一次 pi 进程）。
   */
  async authStatus(): Promise<AuthProviderStatus[]> {
    const configuredNames = Object.keys(readModelsFile(this.modelsDir).providers);
    const candidates = new Set<string>([
      ...configuredNames,
      ...BUILTIN_PROVIDERS.filter((p) => p.authMethod === 'oauth').map((p) => p.name),
    ]);
    const views = [...candidates].map((name) => this.viewOf(name));
    const out: AuthProviderStatus[] = [];
    for (const view of views) {
      if (view.hasSecret) {
        out.push({ name: view.name, type: 'api_key', configured: true, via: 'agentdesk' });
        continue;
      }
      const type =
        view.authMethod === 'oauth' ? 'oauth' : view.authMethod === 'none' ? 'none' : 'api_key';
      if (type === 'none') {
        out.push({ name: view.name, type, configured: false, via: 'pi-auth' });
        continue;
      }
      const configured = await this.probePiAuth(view.name, type);
      out.push({ name: view.name, type, configured, via: 'pi-auth' });
    }
    return out;
  }

  private probePiAuth(name: string, type: 'api_key' | 'oauth'): Promise<boolean> {
    const binary = this.binary;
    if (!binary) return Promise.resolve(false);
    const command = type === 'oauth' ? 'print-bearer-token' : 'print-api-key';
    return new Promise((resolve) => {
      this.execFileImpl(
        binary,
        ['auth', command, '--provider', name, '--model', 'ping'],
        { timeout: 4_000, windowsHide: true },
        (err, stdout) => {
          const ok = !err && stdout.trim().length > 0;
          resolve(ok);
        },
      );
    });
  }

  /** V1 OAuth 桥：系统终端跑 pi 交互模式引导 /login（内置终端 M8 落地，README 8.6.5） */
  launchLogin(): { launched: boolean; terminal: string } {
    if (!this.binary) return { launched: false, terminal: '' };
    try {
      if (process.platform === 'win32') {
        spawn('cmd.exe', ['/c', 'start', '""', this.binary], {
          detached: true,
          stdio: 'ignore',
          windowsHide: false,
        });
      } else if (process.platform === 'darwin') {
        spawn('osascript', ['-e', `tell app "Terminal" to do script "${this.binary}"`], {
          detached: true,
          stdio: 'ignore',
        });
      } else {
        spawn('x-terminal-emulator', ['-e', this.binary], { detached: true, stdio: 'ignore' });
      }
      return { launched: true, terminal: 'system-terminal' };
    } catch {
      return { launched: false, terminal: '' };
    }
  }
}
