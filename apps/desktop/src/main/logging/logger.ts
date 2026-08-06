/**
 * Logger（README 13.1）：pino JSONL 落盘 + pino-roll 轮转 + 敏感信息脱敏。
 * 主日志写入 <logs>/agentdesk/main.log，按天轮转、保留 7 天、单文件 ≤10MB。
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import pino, { type Logger, type LoggerOptions } from 'pino';
import createRoll from 'pino-roll';

export type { Logger };

export function logDir(): string {
  const dir = join(app.getPath('logs'), 'agentdesk');
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * 文本级脱敏（README 13.4 / README 1579 统一规则）。
 */
const SECRET_PATTERNS: Array<{ re: RegExp; keepKey?: boolean }> = [
  { re: /sk-[A-Za-z0-9_-]{16,}/g },
  { re: /Bearer\s+[A-Za-z0-9._~+/-]+=*/g },
  { re: /(api[-_]?key|token|secret|password)\s*[:=]\s*[^\s"',;`]+/gi, keepKey: true },
];

export function redactText(text: string): string {
  let out = text;
  for (const { re, keepKey } of SECRET_PATTERNS) {
    out = out.replace(re, (m) => {
      if (keepKey) {
        const i = m.search(/[:=]/);
        return `${m.slice(0, i + 1)} ***`;
      }
      return '***';
    });
  }
  return out;
}

const REDACT_PATHS = [
  'apiKey',
  'api_key',
  'authorization',
  'proxy',
  'token',
  'secret',
  'password',
  '*.apiKey',
  '*.api_key',
  '*.authorization',
  '*.proxy',
  '*.token',
  '*.secret',
  '*.password',
];

let main: Logger | null = null;

export interface InitLoggerOptions {
  level?: string;
  file?: string;
}

/**
 * 初始化主日志。只能调用一次；随后通过 getMainLogger() 获取实例。
 */
export async function initMainLogger(opts: InitLoggerOptions = {}): Promise<Logger> {
  if (main) return main;
  const dir = logDir();
  const dest = await createRoll({
    file: opts.file ?? join(dir, 'main.log'),
    frequency: 'daily',
    limit: { count: 7 },
    size: '10m',
    mkdir: true,
  });
  const pinoOpts: LoggerOptions = {
    level: opts.level ?? process.env.AGENTDESK_LOG_LEVEL ?? 'info',
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    timestamp: pino.stdTimeFunctions.isoTime,
  };
  main = pino(pinoOpts, dest);
  return main;
}

export function getMainLogger(): Logger {
  if (!main) {
    // 容错：若未被初始化（例如单元测试），回退到 stdout。
    main = pino({ level: process.env.AGENTDESK_LOG_LEVEL ?? 'info' });
  }
  return main;
}

export function getLogger(scope: string): Logger {
  return getMainLogger().child({ scope });
}
