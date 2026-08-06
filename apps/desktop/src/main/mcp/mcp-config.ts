import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import type { McpScope, McpServerConfig, McpServerView } from '@agentdesk/ipc';
import { mcpServerConfigSchema } from '@agentdesk/ipc';

/**
 * MCP 配置存储（README 8.3.1）：
 * 全局 ~/.agentdesk/mcp.json + 工作区 <workspace>/.agentdesk/mcp.json，同名工作区优先。
 * 原则：读-放写（JSONC 容错），原子写（tmp + rename），保留未知字段。
 * 变量插值：${workspace} / ${home} / ${env:VAR} / ${secret:id}（秘密绝不写入硬盘）。
 */

export interface McpConfigFile {
  version?: number;
  servers?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface McpConfigStoreOptions {
  configDir?: string;
}

/** 服务名同时是 pi 工具前缀 mcp__<serverId>__ 的 serverId，只允许安全字符。*/
export const MCP_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;

export function defaultMcpConfigDir(): string {
  return process.env.AGENTDESK_CONFIG_DIR ?? path.join(homedir(), '.agentdesk');
}

export function globalMcpFilePath(configDir: string): string {
  return path.join(configDir, 'mcp.json');
}

export function workspaceMcpFilePath(workspacePath: string): string {
  return path.join(workspacePath, '.agentdesk', 'mcp.json');
}

function readMcpFile(file: string): McpConfigFile {
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return { version: 1, servers: {} };
  }
  const parse = (text: string): McpConfigFile => {
    const parsed = JSON.parse(text) as McpConfigFile;
    return { version: 1, ...parsed, servers: parsed.servers ?? {} };
  };
  try {
    return parse(raw);
  } catch {
    // JSONC 容错：剥离行末注释后重试（README 16.2 ConfigStore 原则）
    const stripped = raw
      .split(/\r?\n/)
      .map((l) => l.replace(/(^|\s)\/\/.*$/, '$1'))
      .join('\n');
    try {
      return parse(stripped);
    } catch {
      return { version: 1, servers: {} };
    }
  }
}

function writeMcpFile(file: string, data: McpConfigFile): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.mcp.json.${process.pid}.tmp`);
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  renameSync(tmp, file);
}

function objectToStrings(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        out[k] = String(v);
      }
    }
  }
  return out;
}

function toServerView(name: string, scope: McpScope, raw: unknown): McpServerView | null {
  const parsed = mcpServerConfigSchema.safeParse(raw);
  if (!parsed.success) return null;
  return { name, scope, config: parsed.data };
}

function normalizeClaudeEntry(entry: Record<string, unknown>): McpServerConfig {
  const type = typeof entry.type === 'string' ? entry.type : undefined;
  const transport: 'stdio' | 'sse' | 'http' =
    type === 'http' || type === 'sse' || type === 'stdio'
      ? type
      : entry.command
        ? 'stdio'
        : entry.url
          ? 'http'
          : 'stdio';
  const config: McpServerConfig = { transport };
  if (typeof entry.command === 'string') config.command = entry.command;
  if (Array.isArray(entry.args) && entry.args.every((a) => typeof a === 'string')) {
    config.args = entry.args as string[];
  }
  if (entry.env && typeof entry.env === 'object') config.env = objectToStrings(entry.env);
  if (typeof entry.cwd === 'string') config.cwd = entry.cwd;
  if (typeof entry.url === 'string') config.url = entry.url;
  if (entry.headers && typeof entry.headers === 'object') {
    config.headers = objectToStrings(entry.headers);
  }
  return config;
}

export class McpConfigStore {
  private readonly configDir: string;

  constructor(options: McpConfigStoreOptions = {}) {
    this.configDir = options.configDir ?? defaultMcpConfigDir();
  }

  /** 全局 + 工作区合并列表，同名工作区覆盖全局。*/
  list(workspacePath?: string): McpServerView[] {
    const merged = new Map<string, McpServerView>();
    for (const [name, raw] of Object.entries(this.readScope('global').servers ?? {})) {
      const view = toServerView(name, 'global', raw);
      if (view) merged.set(name, view);
    }
    if (workspacePath) {
      for (const [name, raw] of Object.entries(
        this.readScope('workspace', workspacePath).servers ?? {},
      )) {
        const view = toServerView(name, 'workspace', raw);
        if (view) merged.set(name, view);
      }
    }
    return [...merged.values()];
  }

  save(input: {
    name: string;
    scope: McpScope;
    config: McpServerConfig;
    workspacePath?: string;
  }): McpServerView {
    if (!MCP_NAME_RE.test(input.name)) {
      throw new Error(`非法 MCP server 名称：${input.name}`);
    }
    const file = this.fileFor(input.scope, input.workspacePath);
    const data = readMcpFile(file);
    writeMcpFile(file, {
      ...data,
      servers: { ...(data.servers ?? {}), [input.name]: input.config },
    });
    return { name: input.name, scope: input.scope, config: input.config };
  }

  remove(name: string, scope: McpScope, workspacePath?: string): boolean {
    const file = this.fileFor(scope, workspacePath);
    const data = readMcpFile(file);
    if (!data.servers || !(name in data.servers)) return false;
    const servers = { ...data.servers };
    delete servers[name];
    writeMcpFile(file, { ...data, servers });
    return true;
  }

  /** 导入 Claude Desktop mcpServers 格式（README 8.3.1）：合法项直接写入，无效项返回 skipped 。*/
  importClaude(
    jsonText: string,
    scope: McpScope,
    workspacePath?: string,
  ): { imported: McpServerView[]; skipped: Array<{ name: string; reason: string }> } {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error('JSON 解析失败');
    }
    const root = parsed as { mcpServers?: Record<string, unknown> };
    if (
      !root ||
      typeof root !== 'object' ||
      !root.mcpServers ||
      typeof root.mcpServers !== 'object'
    ) {
      throw new Error('缺少 mcpServers 字段（Claude Desktop 格式）');
    }
    const imported: McpServerView[] = [];
    const skipped: Array<{ name: string; reason: string }> = [];
    for (const [name, raw] of Object.entries(root.mcpServers)) {
      const entry = (raw ?? {}) as Record<string, unknown>;
      const config = normalizeClaudeEntry(entry);
      const parsedConfig = mcpServerConfigSchema.safeParse(config);
      if (!parsedConfig.success) {
        skipped.push({ name, reason: parsedConfig.error.issues[0]?.message ?? '配置无效' });
        continue;
      }
      if (!MCP_NAME_RE.test(name)) {
        skipped.push({ name, reason: '名称仅允许字母/数字/下划线/连字符，长度 ≤64' });
        continue;
      }
      this.save({
        name,
        scope,
        config: parsedConfig.data,
        ...(workspacePath !== undefined ? { workspacePath } : {}),
      });
      imported.push({ name, scope, config: parsedConfig.data });
    }
    return { imported, skipped };
  }

  readScope(scope: McpScope, workspacePath?: string): McpConfigFile {
    return readMcpFile(this.fileFor(scope, workspacePath));
  }

  /** 导出合并后的配置（AgentDesk mcp.json 格式，README 8.3.1 / 8.3.6）。 */
  exportJson(workspacePath?: string): string {
    const servers: Record<string, McpServerConfig> = {};
    for (const view of this.list(workspacePath)) servers[view.name] = view.config;
    return JSON.stringify({ version: 1, servers }, null, 2);
  }

  fileFor(scope: McpScope, workspacePath?: string): string {
    if (scope === 'workspace') {
      if (!workspacePath) throw new Error('workspace 作用域需要 workspacePath');
      return workspaceMcpFilePath(workspacePath);
    }
    return globalMcpFilePath(this.configDir);
  }
}

export interface InterpolateContext {
  workspace?: string;
  home?: string;
  env?: Record<string, string | undefined>;
  resolveSecret?: (id: string) => string | null;
}

function interpolateString(value: string, ctx: InterpolateContext): string {
  return value.replace(/\$\{([^}]+)\}/g, (match, keyRaw: string) => {
    const key = keyRaw.trim();
    if (key === 'workspace') return ctx.workspace ?? match;
    if (key === 'home') return ctx.home ?? match;
    if (key.startsWith('env:')) {
      const name = key.slice(4);
      return ctx.env?.[name] ?? process.env[name] ?? match;
    }
    if (key.startsWith('secret:')) {
      const id = key.slice(7);
      return ctx.resolveSecret ? (ctx.resolveSecret(id) ?? match) : match;
    }
    return match;
  });
}

/** 将配置中所有字符串的变量占位符解析为实值（秘密由 resolveSecret 提供，不持久化）。*/
export function interpolateConfig(
  config: McpServerConfig,
  ctx: InterpolateContext,
): McpServerConfig {
  const walk = (value: unknown): unknown => {
    if (typeof value === 'string') return interpolateString(value, ctx);
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) out[k] = walk(v);
      return out;
    }
    return value;
  };
  return walk(config) as McpServerConfig;
}
