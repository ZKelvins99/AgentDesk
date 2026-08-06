/**
 * ConfigStore（README 4.3 / 9.7 / 16.2）：
 * 与 pi 共享 settings.json / models.json 的读写 —— JSONC 容错 + 原子写 + 保留用户手写字段，
 * 保存前用 zod schema 校验并给出行内错误（原始配置编辑器 + schema 驱动的设置表单共用）。
 * settings 字段 1:1 覆盖 README 4.3 清单；未知顶层字段一律 passthrough 保留。
 */
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { thinkingLevelSchema } from '@agentdesk/shared';
import { z } from 'zod';

export type ConfigFileKind = 'settings' | 'models';
export type ConfigScope = 'global' | 'project';

export interface ConfigValidationIssue {
  path: string;
  line: number | null;
  message: string;
}

export interface ConfigReadResult {
  path: string;
  raw: string;
  parsed: Record<string, unknown>;
  validation: ConfigValidationIssue[];
}

export interface ConfigSaveResult extends ConfigReadResult {
  saved: boolean;
}

export interface KernelStatus {
  agentDir: string;
  binary: string | null;
  binaryExists: boolean;
  binDir: string;
  binDirExists: boolean;
  version: string | null;
}

const execFileAsync = promisify(execFile);
const VERSION_TIMEOUT_MS = 5_000;

const nestedObject = <T extends z.ZodRawShape>(shape: T): z.ZodType =>
  z.object(shape).passthrough().optional();

/** README 4.3 settings.json 字段（AgentDesk 设置页 1:1 覆盖）。 */
export const piSettingsSchema = z
  .object({
    defaultProvider: z.string().optional(),
    defaultModel: z.string().optional(),
    defaultThinkingLevel: thinkingLevelSchema.optional(),
    thinkingBudgets: nestedObject({
      minimal: z.number().optional(),
      low: z.number().optional(),
      medium: z.number().optional(),
      high: z.number().optional(),
    }),
    enabledModels: z.array(z.string()).optional(),
    hideThinkingBlock: z.boolean().optional(),
    showCacheMissNotices: z.boolean().optional(),
    theme: z.string().optional(),
    externalEditor: z.string().optional(),
    quietStartup: z.boolean().optional(),
    collapseChangelog: z.boolean().optional(),
    uiMode: z.enum(['regular', 'fullscreen']).optional(),
    fullscreenScrollbar: z.string().optional(),
    doubleEscapeAction: z.enum(['tree', 'fork', 'none']).optional(),
    treeFilterMode: z.string().optional(),
    editorPaddingX: z.number().optional(),
    outputPad: z.number().optional(),
    autocompleteMaxVisible: z.number().optional(),
    showHardwareCursor: z.boolean().optional(),
    defaultProjectTrust: z.enum(['ask', 'always', 'never']).optional(),
    enableInstallTelemetry: z.boolean().optional(),
    enableAnalytics: z.boolean().optional(),
    trackingId: z.string().optional(),
    httpProxy: z.string().optional(),
    transport: z.enum(['sse', 'websocket', 'websocket-cached', 'auto']).optional(),
    httpIdleTimeoutMs: z.number().optional(),
    websocketConnectTimeoutMs: z.number().optional(),
    warnings: nestedObject({ anthropicExtraUsage: z.boolean().optional() }),
    compaction: nestedObject({
      enabled: z.boolean().optional(),
      reserveTokens: z.number().optional(),
      keepRecentTokens: z.number().optional(),
    }),
    branchSummary: nestedObject({
      reserveTokens: z.number().optional(),
      skipPrompt: z.boolean().optional(),
    }),
    retry: nestedObject({
      enabled: z.boolean().optional(),
      maxRetries: z.number().optional(),
      baseDelayMs: z.number().optional(),
      provider: nestedObject({
        timeoutMs: z.number().optional(),
        maxRetries: z.number().optional(),
        maxRetryDelayMs: z.number().optional(),
      }),
    }),
    steeringMode: z.enum(['all', 'one-at-a-time']).optional(),
    followUpMode: z.enum(['all', 'one-at-a-time']).optional(),
    terminal: nestedObject({
      showImages: z.boolean().optional(),
      imageWidthCells: z.number().optional(),
      clearOnShrink: z.boolean().optional(),
    }),
    images: nestedObject({
      autoResize: z.boolean().optional(),
      blockImages: z.boolean().optional(),
    }),
    shellPath: z.string().optional(),
    shellCommandPrefix: z.string().optional(),
    npmCommand: z.array(z.string()).optional(),
    sessionDir: z.string().optional(),
    markdown: nestedObject({ codeBlockIndent: z.string().optional() }),
    packages: z.array(z.unknown()).optional(),
    extensions: z.array(z.string()).optional(),
    skills: z.array(z.string()).optional(),
    prompts: z.array(z.string()).optional(),
    themes: z.array(z.string()).optional(),
    enableSkillCommands: z.boolean().optional(),
  })
  .passthrough();

/** models.json 只做结构校验（providers 为对象），深层交给 ProviderManager。 */
export const piModelsSchema = z
  .object({
    providers: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** JSONC 容错解析（剥注释 + 尾逗号），失败返回 null。 */
export function parseJsonc(text: string): Record<string, unknown> | null {
  const stripped = text
    .split(/\r?\n/)
    .map((line) => line.replace(/(^|\s)\/\/.*$/, '$1'))
    .join('\n')
    .replace(/,\s*([}\]])/g, '$1');
  try {
    const parsed = JSON.parse(stripped) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function validateConfig(
  kind: ConfigFileKind,
  parsed: Record<string, unknown>,
): ConfigValidationIssue[] {
  const schema = kind === 'settings' ? piSettingsSchema : piModelsSchema;
  const result = schema.safeParse(parsed);
  if (result.success) return [];
  return result.error.issues.map((issue) => ({
    path: issue.path.map(String).join('.') || '(root)',
    line: null,
    message: issue.message,
  }));
}

/** 给校验问题补行号（按 path 末段在原文中定位，best-effort）。 */
export function locateIssueLines(
  raw: string,
  issues: ConfigValidationIssue[],
): ConfigValidationIssue[] {
  if (issues.length === 0) return issues;
  const lines = raw.split(/\r?\n/);
  return issues.map((issue) => {
    if (issue.line !== null) return issue;
    const key = issue.path.split('.').pop() ?? '';
    if (!key) return issue;
    const re = new RegExp(`["']?${escapeRegex(key)}["']?\\s*:`);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (line !== undefined && re.test(line)) return { ...issue, line: i + 1 };
    }
    return issue;
  });
}

export function defaultAgentDir(): string {
  return process.env.PI_CODING_AGENT_DIR ?? path.join(homedir(), '.pi', 'agent');
}

export class ConfigStore {
  private readonly agentDir: string;

  constructor(options: { agentDir?: string } = {}) {
    this.agentDir = options.agentDir ?? defaultAgentDir();
  }

  filePathOf(kind: ConfigFileKind, scope: ConfigScope, workspacePath?: string): string {
    if (scope === 'project') {
      if (!workspacePath) throw new Error('项目作用域需要 workspacePath');
      return path.join(workspacePath, '.pi', kind === 'settings' ? 'settings.json' : 'models.json');
    }
    return path.join(this.agentDir, kind === 'settings' ? 'settings.json' : 'models.json');
  }

  read(kind: ConfigFileKind, scope: ConfigScope, workspacePath?: string): ConfigReadResult {
    const file = this.filePathOf(kind, scope, workspacePath);
    let raw = '';
    try {
      raw = readFileSync(file, 'utf8');
    } catch {
      // 文件不存在按空配置处理
    }
    const parsed = parseJsonc(raw) ?? {};
    const validation = locateIssueLines(raw, validateConfig(kind, parsed));
    return { path: file, raw, parsed, validation };
  }

  private writeRaw(file: string, raw: string): void {
    mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, raw.endsWith('\n') ? raw : `${raw}\n`, 'utf8');
    renameSync(tmp, file);
  }

  /** 保存：raw（原样写）或 parsed（序列化写）；校验不通过则拒绝落盘。 */
  save(
    kind: ConfigFileKind,
    scope: ConfigScope,
    input: { raw?: string; parsed?: Record<string, unknown> },
    workspacePath?: string,
  ): ConfigSaveResult {
    const file = this.filePathOf(kind, scope, workspacePath);
    let raw: string;
    let parsed: Record<string, unknown>;
    if (input.raw !== undefined) {
      raw = input.raw;
      const parsedOrNull = parseJsonc(raw);
      if (!parsedOrNull) {
        return {
          path: file,
          raw,
          parsed: {},
          validation: [{ path: '(root)', line: null, message: 'JSON/JSONC 解析失败，无法保存' }],
          saved: false,
        };
      }
      parsed = parsedOrNull;
    } else {
      parsed = input.parsed ?? {};
      raw = `${JSON.stringify(parsed, null, 2)}\n`;
    }
    const validation = locateIssueLines(raw, validateConfig(kind, parsed));
    if (validation.length > 0) {
      return { path: file, raw, parsed, validation, saved: false };
    }
    this.writeRaw(file, raw);
    return { path: file, raw, parsed, validation, saved: true };
  }

  async kernelStatus(binary: string | null): Promise<KernelStatus> {
    const binDir = path.join(this.agentDir, 'bin');
    let version: string | null = null;
    if (binary && existsSync(binary)) {
      try {
        const { stdout } = await execFileAsync(binary, ['--version'], {
          timeout: VERSION_TIMEOUT_MS,
          windowsHide: true,
        });
        version = stdout.trim() || null;
      } catch {
        version = null;
      }
    }
    return {
      agentDir: this.agentDir,
      binary,
      binaryExists: binary !== null && existsSync(binary),
      binDir,
      binDirExists: existsSync(binDir),
      version,
    };
  }
}
