/**
 * Pi Package 安全审查（README 8.5.1）：
 * 安装前展示将安装的文件清单、package.json 的 dependencies、是否含 postinstall 等安装期脚本，
 * 由 UI 要求用户显式确认「此包将以我的权限运行任意代码」。
 * - npm：`npm view <spec> --json`（依赖/脚本/许可证）+ `npm pack <spec> --dry-run --json`（文件清单）
 * - git：浅克隆到临时目录后扫描，审查完即清理（pi install 会自行再拉取）
 * - local：直接扫描目录
 */
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { PackageInstallSource, PackageSourceType } from './package-manager';

export interface PackageSecurityInspection {
  source: string;
  sourceType: PackageSourceType;
  name: string;
  version?: string;
  fileCount: number;
  files: string[];
  hasPostinstall: boolean;
  installScripts: { preinstall?: string; install?: string; postinstall?: string };
  dependencies: Record<string, string>;
  license?: string;
  description?: string;
  warnings: string[];
}

export interface RunCommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type RunCommand = (
  binary: string,
  args: string[],
  options: { cwd?: string; timeoutMs?: number },
) => Promise<RunCommandResult>;

export interface PackageSecurityOptions {
  npmCommand?: string;
  gitCommand?: string;
  runner?: RunCommand;
}

const execFileAsync = promisify(execFile);
const INSPECT_TIMEOUT_MS = 60_000;
const MAX_FILES = 300;

async function defaultRunner(
  binary: string,
  args: string[],
  options: { cwd?: string; timeoutMs?: number },
): Promise<RunCommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync(binary, args, {
      cwd: options.cwd,
      timeout: options.timeoutMs ?? INSPECT_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { code: 0, stdout: stdout ?? '', stderr: stderr ?? '' };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string; message?: string };
    return {
      code: typeof e.code === 'number' ? e.code : 1,
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? e.message ?? String(err),
    };
  }
}

function toSourceSpec(source: PackageInstallSource): string {
  if (source.type === 'npm') {
    return `npm:${source.name}${source.version ? `@${source.version}` : ''}`;
  }
  if (source.type === 'git') {
    return `git:${source.url}${source.ref ? `#${source.ref}` : ''}`;
  }
  return `local:${source.path}`;
}

interface PkgMeta {
  name?: unknown;
  version?: unknown;
  dependencies?: unknown;
  scripts?: unknown;
  license?: unknown;
  description?: unknown;
}

function readPackageJson(dir: string): PkgMeta {
  try {
    const parsed = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as PkgMeta) : {};
  } catch {
    return {};
  }
}

function asStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(value)) {
    if (typeof val === 'string') out[key] = val;
  }
  return out;
}

function scanFiles(root: string): string[] {
  const out: string[] = [];
  const visit = (dir: string, rel: string): void => {
    if (out.length >= MAX_FILES) return;
    let entries: import('node:fs').Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= MAX_FILES) return;
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) visit(full, relPath);
      else out.push(relPath);
    }
  };
  visit(root, '');
  return out;
}

function repoNameOf(url: string): string {
  const target = url.split('#')[0] ?? '';
  const tail = target.split(/[/:]/).pop() ?? '';
  return tail.replace(/\.git$/, '') || 'git-package';
}

function buildInspection(
  sourceType: PackageSourceType,
  source: string,
  dir: string,
  fallbackName: string,
): PackageSecurityInspection {
  const pkg = readPackageJson(dir);
  const scripts = asStringMap(pkg.scripts);
  const dependencies = asStringMap(pkg.dependencies);
  const installScripts: { preinstall?: string; install?: string; postinstall?: string } = {};
  if (scripts.preinstall !== undefined) installScripts.preinstall = scripts.preinstall;
  if (scripts.install !== undefined) installScripts.install = scripts.install;
  if (scripts.postinstall !== undefined) installScripts.postinstall = scripts.postinstall;
  const hasPostinstall = scripts.postinstall !== undefined;
  const files = scanFiles(dir);
  const warnings: string[] = [];
  if (hasPostinstall) {
    warnings.push('包含 postinstall 脚本：安装时会以你的权限执行任意代码');
  }
  if (scripts.preinstall !== undefined) {
    warnings.push('包含 preinstall 脚本：安装时同样会执行');
  }
  if (scripts.install !== undefined) {
    warnings.push('包含 install 脚本：安装时同样会执行');
  }
  if (Object.keys(pkg).length === 0) {
    warnings.push('未找到 package.json，无法确认依赖与安装脚本');
  }
  return {
    source,
    sourceType,
    name: typeof pkg.name === 'string' && pkg.name ? pkg.name : fallbackName,
    ...(typeof pkg.version === 'string' && pkg.version ? { version: pkg.version } : {}),
    fileCount: files.length,
    files,
    hasPostinstall,
    installScripts,
    dependencies,
    ...(typeof pkg.license === 'string' && pkg.license ? { license: pkg.license } : {}),
    ...(typeof pkg.description === 'string' && pkg.description
      ? { description: pkg.description }
      : {}),
    warnings,
  };
}

function parseNpmView(stdout: string): PkgMeta {
  let raw: unknown;
  try {
    raw = JSON.parse(stdout) as unknown;
  } catch {
    return {};
  }
  const obj = Array.isArray(raw) ? raw[0] : raw;
  return obj && typeof obj === 'object' ? (obj as PkgMeta) : {};
}

function parseNpmPackFiles(stdout: string): string[] {
  let raw: unknown;
  try {
    raw = JSON.parse(stdout) as unknown;
  } catch {
    return [];
  }
  const obj = Array.isArray(raw) ? raw[0] : raw;
  if (!obj || typeof obj !== 'object') return [];
  const files = (obj as { files?: unknown }).files;
  if (!Array.isArray(files)) return [];
  return files
    .map((f) => {
      if (!f || typeof f !== 'object') return '';
      const p = (f as { path?: unknown }).path;
      return typeof p === 'string' ? p : '';
    })
    .filter(Boolean);
}

/** 安装前安全审查（README 8.5.1）：文件清单 + dependencies + 安装期脚本。 */
export class PackageSecurityInspector {
  private readonly npmCommand: string;
  private readonly gitCommand: string;
  private readonly runner: RunCommand;

  constructor(options: PackageSecurityOptions = {}) {
    this.npmCommand = options.npmCommand ?? 'npm';
    this.gitCommand = options.gitCommand ?? 'git';
    this.runner = options.runner ?? defaultRunner;
  }

  async inspect(source: PackageInstallSource): Promise<PackageSecurityInspection> {
    if (source.type === 'npm') return this.inspectNpm(source);
    if (source.type === 'git') return this.inspectGit(source);
    return this.inspectLocal(source);
  }

  private async inspectNpm(source: {
    type: 'npm';
    name: string;
    version?: string;
  }): Promise<PackageSecurityInspection> {
    const spec = source.version ? `${source.name}@${source.version}` : source.name;
    const [viewRes, packRes] = await Promise.all([
      this.runner(this.npmCommand, ['view', spec, '--json'], { timeoutMs: INSPECT_TIMEOUT_MS }),
      this.runner(this.npmCommand, ['pack', spec, '--dry-run', '--json'], {
        cwd: mkdtempSync(path.join(tmpdir(), 'agentdesk-pkg-inspect-')),
        timeoutMs: INSPECT_TIMEOUT_MS,
      }),
    ]);
    if (viewRes.code !== 0) {
      throw new Error(`npm view ${spec} 失败：${viewRes.stderr || viewRes.stdout}`);
    }
    const pkg = parseNpmView(viewRes.stdout);
    const files = parseNpmPackFiles(packRes.stdout);
    const fallbackName = source.name;
    const scripts = asStringMap(pkg.scripts);
    const dependencies = asStringMap(pkg.dependencies);
    const installScripts: { preinstall?: string; install?: string; postinstall?: string } = {};
    if (scripts.preinstall !== undefined) installScripts.preinstall = scripts.preinstall;
    if (scripts.install !== undefined) installScripts.install = scripts.install;
    if (scripts.postinstall !== undefined) installScripts.postinstall = scripts.postinstall;
    const hasPostinstall = scripts.postinstall !== undefined;
    const warnings: string[] = [];
    if (hasPostinstall) warnings.push('包含 postinstall 脚本：安装时会以你的权限执行任意代码');
    if (scripts.preinstall !== undefined) warnings.push('包含 preinstall 脚本：安装时同样会执行');
    if (scripts.install !== undefined) warnings.push('包含 install 脚本：安装时同样会执行');
    return {
      source: toSourceSpec(source),
      sourceType: 'npm',
      name: typeof pkg.name === 'string' && pkg.name ? pkg.name : fallbackName,
      ...(typeof pkg.version === 'string' && pkg.version ? { version: pkg.version } : {}),
      fileCount: files.length,
      files,
      hasPostinstall,
      installScripts,
      dependencies,
      ...(typeof pkg.license === 'string' && pkg.license ? { license: pkg.license } : {}),
      ...(typeof pkg.description === 'string' && pkg.description
        ? { description: pkg.description }
        : {}),
      warnings,
    };
  }

  private async inspectGit(source: {
    type: 'git';
    url: string;
    ref?: string;
  }): Promise<PackageSecurityInspection> {
    const temp = mkdtempSync(path.join(tmpdir(), 'agentdesk-pkg-inspect-'));
    try {
      const args = ['clone', '--depth', '1'];
      if (source.ref !== undefined) args.push('--branch', source.ref);
      args.push(source.url, temp);
      const res = await this.runner(this.gitCommand, args, { timeoutMs: INSPECT_TIMEOUT_MS });
      if (res.code !== 0) {
        throw new Error(`git clone 失败：${res.stderr || res.stdout}`);
      }
      return buildInspection('git', toSourceSpec(source), temp, repoNameOf(source.url));
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  }

  private inspectLocal(source: { type: 'local'; path: string }): PackageSecurityInspection {
    if (!existsSync(source.path)) {
      throw new Error(`本地目录不存在：${source.path}`);
    }
    return buildInspection(
      'local',
      toSourceSpec(source),
      source.path,
      path.basename(source.path) || 'local-package',
    );
  }
}
