/**
 * DiagnosticService（README 13.3）：
 * - 收集诊断信息（版本、内核、环境、日志目录、指标）。
 * - 导出诊断 zip：日志（main.log 最近 200 行 + 各 sidecar/mcp 日志）、配置快照、环境探测。
 * 默认不自动发送，仅在用户手动导出时生成。
 */

import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { arch, homedir, platform, release, type } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import type { DiagnosticInfo } from '@agentdesk/ipc';
import AdmZip from 'adm-zip';
import { app } from 'electron';
import type { KernelManager } from '../kernel/kernel-manager';
import { logDir, redactText } from '../logging/logger';
import type { MetricsStore } from './metrics-store';

const execFileAsync = promisify(execFile);

export interface DiagnosticDeps {
  kernelManager: KernelManager;
  metrics: MetricsStore;
}

const TAIL_LINES = 200;

function tail(file: string, lines: number): string {
  if (!existsSync(file)) return '';
  const raw = readFileSync(file, 'utf8');
  const parts = raw.split(/\r?\n/).filter((l) => l.length > 0);
  return parts.slice(-lines).join('\n');
}

async function readJson(file: string): Promise<Record<string, unknown> | null> {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export class DiagnosticService {
  constructor(private readonly deps: DiagnosticDeps) {}

  logDir(): string {
    return logDir();
  }

  async info(): Promise<DiagnosticInfo> {
    const kernel = this.deps.kernelManager.resolveActive();
    const dir = logDir();
    let bash: string | null = null;
    try {
      const { stdout } = await execFileAsync('bash', ['--version'], {
        timeout: 5_000,
        windowsHide: true,
      });
      bash = stdout.split(/\r?\n/)[0]?.trim() ?? null;
    } catch {
      bash = null;
    }
    const since = Date.now() - 24 * 60 * 60 * 1000;
    return {
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron ?? 'unknown',
      nodeVersion: process.versions.node ?? 'unknown',
      chromeVersion: process.versions.chrome ?? 'unknown',
      os: `${type()} ${release()}`,
      platform: `${platform()}-${arch()}`,
      kernelVersion: kernel.version,
      bash,
      logDir: dir,
      metrics: this.deps.metrics.summary(since),
    };
  }

  /**
   * 导出诊断 zip 到指定路径。返回最终 zip 路径。
   */
  async exportTo(outFile: string): Promise<string> {
    const zip = new AdmZip();
    const dir = logDir();

    // 1. main.log 最近 200 行（脱敏）
    const mainTail = redactText(tail(join(dir, 'main.log'), TAIL_LINES));
    zip.addFile('logs/main.log.tail.txt', Buffer.from(mainTail, 'utf8'));

    // 2. sidecar / mcp 日志（各取最近 200 行，脱敏）
    if (existsSync(dir)) {
      for (const f of readdirSync(dir)) {
        if (f.startsWith('sidecar-') || f.startsWith('mcp-')) {
          const text = redactText(tail(join(dir, f), TAIL_LINES));
          zip.addFile(`logs/${f}.tail.txt`, Buffer.from(text, 'utf8'));
        }
      }
    }

    // 3. 配置快照（settings / models / mcp 配置，脱敏，不含 secrets 文件）
    const dataDir = join(homedir(), '.agentdesk');
    for (const name of ['settings.json', 'models.json', 'mcp-config.json', 'onboarding.json']) {
      const file = join(dataDir, name);
      if (existsSync(file)) {
        const parsed = await readJson(file);
        zip.addFile(
          `config/${name}`,
          Buffer.from(redactText(JSON.stringify(parsed ?? {}, null, 2)), 'utf8'),
        );
      }
    }

    // 4. 环境信息
    const info = await this.info();
    zip.addFile('env.json', Buffer.from(JSON.stringify(info, null, 2), 'utf8'));

    // 5. active.json（不含 secrets）
    const activeFile = join(dataDir, 'kernels', 'active.json');
    if (existsSync(activeFile)) {
      zip.addFile('config/kernels-active.json', readFileSync(activeFile));
    }

    mkdirSync(dirname(outFile), { recursive: true });
    zip.writeZip(outFile);
    return outFile;
  }

  /** 返回日志目录文件列表（供“打开日志目录”与 UI 展示）。 */
  listLogFiles(limit = 50): Array<{ name: string; bytes: number; modifiedAt: number }> {
    const dir = logDir();
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith('.log'))
      .map((f) => {
        const st = statSync(join(dir, f));
        return { name: f, bytes: st.size, modifiedAt: st.mtimeMs };
      })
      .sort((a, b) => b.modifiedAt - a.modifiedAt)
      .slice(0, limit);
  }
}

/** 打开系统文件管理器到日志目录。 */
export function openLogDir(): string {
  const dir = logDir();
  mkdirSync(dir, { recursive: true });
  return dir;
}
