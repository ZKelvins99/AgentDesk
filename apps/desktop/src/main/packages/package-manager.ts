/**
 * Pi Package 管理（README 8.5.1 / 4.13）：
 * - 列表：读 settings.packages[]（全局 ~/.pi/agent/settings.json + 项目 .pi/settings.json），
 *   best-effort 调 `pi list` 补 installed 状态；展示来源类型 / 版本 / ref / 资源数 / 安装路径。
 * - 安装/卸载/更新：调 pi CLI（pi install/remove/update），完整 stdout/stderr 回传，
 *   成功后把条目写回 settings.packages[]（pi 自行写入时幂等）。
 * - 资源级启停：写 settings.packages[] 对象形式过滤
 *   { source, extensions, skills, prompts, themes, autoload }，[]=全不加载，!/+/- 规则沿用 README 4.3。
 * - 作用域：全局 / 项目；同名包冲突标注（项目覆盖全局 / autoload:false 时 delta 叠加）。
 */
import { execFile } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { readPiSettings, writePiSettings } from '../skills/pi-settings';

export type PackageSourceType = 'npm' | 'git' | 'local';
export type PackageScope = 'global' | 'project';
export type PackageConflict =
  | 'project-overrides'
  | 'delta-overlay'
  | 'overridden-by-project'
  | null;

export interface PackageResourceFilter {
  extensions?: string[];
  skills?: string[];
  prompts?: string[];
  themes?: string[];
  autoload?: boolean;
}

export interface PackageView {
  id: string;
  source: string;
  sourceType: PackageSourceType;
  name: string;
  scope: PackageScope;
  version?: string;
  ref?: string;
  installed: boolean;
  installPath?: string;
  resources: { extensions: number; skills: number; prompts: number; themes: number };
  filter?: PackageResourceFilter;
  autoload: boolean;
  conflict: PackageConflict;
}

export type PackageInstallSource =
  | { type: 'npm'; name: string; version?: string }
  | { type: 'git'; url: string; ref?: string }
  | { type: 'local'; path: string };

export interface PackageCommandResult {
  ok: boolean;
  log: string;
  command: string;
  note?: string;
  package?: PackageView;
}

export interface RunCommandOptions {
  cwd?: string;
  timeoutMs?: number;
}

export interface RunCommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type RunCommand = (
  binary: string,
  args: string[],
  options: RunCommandOptions,
) => Promise<RunCommandResult>;

export interface PackageManagerOptions {
  binary?: string;
  agentDir?: string;
  runner?: RunCommand;
}

const execFileAsync = promisify(execFile);
const INSTALL_TIMEOUT_MS = 10 * 60 * 1000;
const QUICK_TIMEOUT_MS = 15_000;
const MAX_SCAN_DEPTH = 4;

async function defaultRunner(
  binary: string,
  args: string[],
  options: RunCommandOptions,
): Promise<RunCommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync(binary, args, {
      cwd: options.cwd,
      timeout: options.timeoutMs ?? QUICK_TIMEOUT_MS,
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

interface ParsedEntry {
  source: string;
  sourceType: PackageSourceType;
  name: string;
  version?: string;
  ref?: string;
  identity: string;
  filter?: PackageResourceFilter;
}

function stripPrefix(raw: string, prefix: string): string {
  return raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
}

function splitVersion(value: string): { name: string; version?: string } {
  const at = value.lastIndexOf('@');
  if (at > 0 && at < value.length - 1) {
    return { name: value.slice(0, at), version: value.slice(at + 1) };
  }
  return { name: value };
}

function isUrl(value: string): boolean {
  return /^(https?:\/\/|git@|ssh:\/\/)/.test(value);
}

function isPath(value: string): boolean {
  return (
    value === '~' ||
    value.startsWith('~/') ||
    path.isAbsolute(value) ||
    /^[a-zA-Z]:[\\/]/.test(value)
  );
}

function gitName(url: string): string {
  const target = url.split('#')[0] ?? '';
  const tail = target.split(/[/:]/).pop() ?? '';
  return tail.replace(/\.git$/, '') || 'git-package';
}

function gitInstallDir(agentDir: string, url: string): string {
  const target = url.split('#')[0] ?? '';
  const rest = target
    .replace(/^https?:\/\//, '')
    .replace(/^ssh:\/\//, '')
    .replace(/^git@/, '');
  const [hostRaw, ...parts] = rest.split(/[/:]/);
  const host = hostRaw ?? '';
  const dirName = parts.join('/').replace(/\.git$/, '') || host;
  return path.join(agentDir, 'git', host, dirName);
}

function specOfParsed(parsed: ParsedEntry): string {
  if (parsed.sourceType === 'npm') {
    return parsed.version ? `npm:${parsed.name}@${parsed.version}` : `npm:${parsed.name}`;
  }
  if (parsed.sourceType === 'git') {
    return `git:${parsed.identity}${parsed.ref ? `#${parsed.ref}` : ''}`;
  }
  return `local:${parsed.identity}`;
}

/** 解析设置条目/UI 来源为统一内部结构（README 4.13 身份判定）。 */
export function parsePackageSource(raw: string, baseDir?: string): ParsedEntry {
  const value = raw.trim();
  let sourceType: PackageSourceType;
  if (value.startsWith('npm:')) sourceType = 'npm';
  else if (value.startsWith('git:')) sourceType = 'git';
  else if (value.startsWith('local:')) sourceType = 'local';
  else if (isUrl(value)) sourceType = 'git';
  else if (isPath(value)) sourceType = 'local';
  else sourceType = 'npm';

  if (sourceType === 'npm') {
    const { name, version } = splitVersion(stripPrefix(value, 'npm:'));
    return {
      source: value,
      sourceType,
      name,
      identity: name,
      ...(version !== undefined ? { version } : {}),
    };
  }
  if (sourceType === 'git') {
    const body = stripPrefix(value, 'git:');
    const hash = body.lastIndexOf('#');
    const url = hash >= 0 ? body.slice(0, hash) : body;
    const ref = hash >= 0 ? body.slice(hash + 1) : undefined;
    return {
      source: value,
      sourceType,
      name: gitName(url),
      identity: url.replace(/\/+$/, ''),
      ...(ref !== undefined ? { ref } : {}),
    };
  }
  const body = stripPrefix(value, 'local:');
  const expanded =
    body === '~' || body.startsWith('~/') ? path.join(homedir(), body.slice(1)) : body;
  const abs = path.isAbsolute(expanded)
    ? expanded
    : path.resolve(baseDir ?? process.cwd(), expanded);
  return {
    source: value,
    sourceType,
    name: path.basename(abs) || abs,
    identity: abs.split('\\').join('/'),
  };
}

function toSettingsSpec(source: PackageInstallSource): string {
  if (source.type === 'npm') {
    return `npm:${source.name}${source.version ? `@${source.version}` : ''}`;
  }
  if (source.type === 'git') {
    return `git:${source.url}${source.ref ? `#${source.ref}` : ''}`;
  }
  return `local:${source.path}`;
}

function entriesOf(raw: unknown): Array<{ spec: string; filter?: PackageResourceFilter }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ spec: string; filter?: PackageResourceFilter }> = [];
  for (const item of raw) {
    if (typeof item === 'string' && item.trim()) {
      out.push({ spec: item.trim() });
    } else if (item && typeof item === 'object') {
      const obj = item as {
        source?: unknown;
        extensions?: unknown;
        skills?: unknown;
        prompts?: unknown;
        themes?: unknown;
        autoload?: unknown;
      };
      if (typeof obj.source !== 'string' || !obj.source.trim()) continue;
      const filter: PackageResourceFilter = {};
      for (const key of ['extensions', 'skills', 'prompts', 'themes'] as const) {
        const val = obj[key];
        if (Array.isArray(val) && val.every((v) => typeof v === 'string')) {
          filter[key] = val as string[];
        }
      }
      if (typeof obj.autoload === 'boolean') filter.autoload = obj.autoload;
      const hasFilter = Object.keys(filter).length > 0;
      out.push(hasFilter ? { spec: obj.source.trim(), filter } : { spec: obj.source.trim() });
    }
  }
  return out;
}

function countFilesByExt(root: string, ext: string, depth = 0): number {
  if (!existsSync(root) || depth > MAX_SCAN_DEPTH) return 0;
  let count = 0;
  try {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      const full = path.join(root, entry.name);
      if (entry.isDirectory()) count += countFilesByExt(full, ext, depth + 1);
      else if (entry.name.endsWith(ext)) count += 1;
    }
  } catch {
    // 目录不可读按 0 计
  }
  return count;
}

function countSkillDirs(root: string, depth = 0): number {
  if (!existsSync(root)) return 0;
  if (existsSync(path.join(root, 'SKILL.md'))) return 1;
  if (depth > MAX_SCAN_DEPTH) return 0;
  let count = 0;
  try {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory()) count += countSkillDirs(path.join(root, entry.name), depth + 1);
    }
  } catch {
    // 忽略
  }
  return count;
}

/** 按 README 4.13 约定目录统计包内资源数（best-effort）。 */
export function countPackageResources(installPath: string | undefined): {
  extensions: number;
  skills: number;
  prompts: number;
  themes: number;
} {
  if (!installPath) return { extensions: 0, skills: 0, prompts: 0, themes: 0 };
  return {
    extensions:
      countFilesByExt(path.join(installPath, 'extensions'), '.ts') +
      countFilesByExt(path.join(installPath, 'extensions'), '.js'),
    skills: countSkillDirs(path.join(installPath, 'skills')),
    prompts: countFilesByExt(path.join(installPath, 'prompts'), '.md'),
    themes: countFilesByExt(path.join(installPath, 'themes'), '.json'),
  };
}

function mergeLog(result: RunCommandResult): string {
  const out = [result.stdout, result.stderr].filter((s) => s.trim()).join('\n');
  return out || '(无输出)';
}

export class PackageManager {
  private readonly binary: string | null;
  private readonly agentDir: string;
  private readonly runner: RunCommand;

  constructor(options: PackageManagerOptions = {}) {
    this.binary = options.binary ?? null;
    this.agentDir = options.agentDir ?? path.join(homedir(), '.pi', 'agent');
    this.runner = options.runner ?? defaultRunner;
  }

  globalSettingsFile(): string {
    return path.join(this.agentDir, 'settings.json');
  }

  private settingsFileOf(scope: PackageScope, workspacePath?: string): string {
    if (scope === 'global') return this.globalSettingsFile();
    if (!workspacePath) throw new Error('项目作用域需要 workspacePath');
    return path.join(workspacePath, '.pi', 'settings.json');
  }

  private baseDirOf(scope: PackageScope, workspacePath?: string): string {
    return scope === 'global' ? this.agentDir : path.join(workspacePath ?? '', '.pi');
  }

  private installPathOf(entry: ParsedEntry): string | undefined {
    if (entry.sourceType === 'npm') {
      const direct = path.join(this.agentDir, 'npm', entry.name);
      if (existsSync(direct)) return direct;
      const scoped = path.join(this.agentDir, 'npm', ...entry.name.split('/'));
      return existsSync(scoped) ? scoped : direct;
    }
    if (entry.sourceType === 'git') return gitInstallDir(this.agentDir, entry.identity);
    return entry.identity;
  }

  private async piListTokens(): Promise<Set<string>> {
    const tokens = new Set<string>();
    if (!this.binary) return tokens;
    const res = await this.runner(this.binary, ['list'], { timeoutMs: QUICK_TIMEOUT_MS });
    if (res.code !== 0) return tokens;
    for (const line of `${res.stdout}\n${res.stderr}`.split(/\r?\n/)) {
      for (const token of line.trim().split(/\s+/)) {
        if (!token) continue;
        tokens.add(token.replace(/[|*>-]/g, ''));
      }
    }
    return tokens;
  }

  private isListed(entry: ParsedEntry, tokens: Set<string>): boolean {
    for (const token of tokens) {
      if (entry.sourceType === 'npm' && (token === entry.name || token === `npm:${entry.name}`)) {
        return true;
      }
      if (
        entry.sourceType === 'git' &&
        (token === entry.identity || token === `git:${entry.identity}`)
      ) {
        return true;
      }
      if (
        entry.sourceType === 'local' &&
        (token === entry.identity || token === `local:${entry.identity}`)
      ) {
        return true;
      }
    }
    return false;
  }

  private toView(
    entry: ParsedEntry,
    scope: PackageScope,
    filter: PackageResourceFilter | undefined,
    extra: { piTokens: Set<string>; conflict: PackageConflict },
  ): PackageView {
    const installPath = this.installPathOf(entry);
    const onDisk = installPath ? existsSync(installPath) : false;
    return {
      id: `${scope}:${entry.identity}`,
      source: entry.source,
      sourceType: entry.sourceType,
      name: entry.name,
      scope,
      ...(entry.version !== undefined ? { version: entry.version } : {}),
      ...(entry.ref !== undefined ? { ref: entry.ref } : {}),
      installed: onDisk || this.isListed(entry, extra.piTokens),
      ...(installPath ? { installPath } : {}),
      resources: countPackageResources(installPath),
      ...(filter ? { filter } : {}),
      autoload: filter?.autoload ?? true,
      conflict: extra.conflict,
    };
  }

  /** 列表（README 8.5.1）：全局 + 项目条目合并，同名包冲突标注。 */
  async list(workspacePath?: string): Promise<PackageView[]> {
    const globalSettings = readPiSettings(this.globalSettingsFile());
    const projectSettings = workspacePath
      ? readPiSettings(path.join(workspacePath, '.pi', 'settings.json'))
      : {};
    const globalItems = entriesOf(globalSettings.packages).map((e) => ({
      ...e,
      parsed: parsePackageSource(e.spec, this.agentDir),
    }));
    const projectItems = entriesOf(projectSettings.packages).map((e) => ({
      ...e,
      parsed: parsePackageSource(
        e.spec,
        workspacePath ? path.join(workspacePath, '.pi') : undefined,
      ),
    }));
    const piTokens = await this.piListTokens();
    const projectIdentities = new Set(projectItems.map((p) => p.parsed.identity));
    const projectAutoloadFalse = new Set(
      projectItems.filter((p) => p.filter?.autoload === false).map((p) => p.parsed.identity),
    );
    const globalIdentities = new Set(globalItems.map((g) => g.parsed.identity));
    const globalViews = globalItems.map((g) =>
      this.toView(g.parsed, 'global', g.filter, {
        piTokens,
        conflict: projectIdentities.has(g.parsed.identity)
          ? projectAutoloadFalse.has(g.parsed.identity)
            ? 'delta-overlay'
            : 'overridden-by-project'
          : null,
      }),
    );
    const projectViews = projectItems.map((p) =>
      this.toView(p.parsed, 'project', p.filter, {
        piTokens,
        conflict: globalIdentities.has(p.parsed.identity)
          ? p.filter?.autoload === false
            ? 'delta-overlay'
            : 'project-overrides'
          : null,
      }),
    );
    return [...globalViews, ...projectViews];
  }

  private upsertEntry(spec: string, scope: PackageScope, workspacePath?: string): void {
    const settingsFile = this.settingsFileOf(scope, workspacePath);
    const baseDir = this.baseDirOf(scope, workspacePath);
    const target = parsePackageSource(spec, baseDir).identity;
    const settings = readPiSettings(settingsFile);
    const packages = Array.isArray(settings.packages) ? [...settings.packages] : [];
    const exists = packages.some((item) => {
      const source = typeof item === 'string' ? item : (item as { source?: unknown }).source;
      return typeof source === 'string' && parsePackageSource(source, baseDir).identity === target;
    });
    if (!exists) packages.push(spec);
    writePiSettings(settingsFile, { ...settings, packages });
  }

  private removeEntry(identity: string, scope: PackageScope, workspacePath?: string): void {
    const settingsFile = this.settingsFileOf(scope, workspacePath);
    const baseDir = this.baseDirOf(scope, workspacePath);
    const settings = readPiSettings(settingsFile);
    const packages = Array.isArray(settings.packages) ? settings.packages : [];
    const next = packages.filter((item) => {
      const source = typeof item === 'string' ? item : (item as { source?: unknown }).source;
      return !(
        typeof source === 'string' && parsePackageSource(source, baseDir).identity === identity
      );
    });
    writePiSettings(settingsFile, { ...settings, packages: next });
  }

  /** 安装（README 8.5.1）：pi install <src>，-l 写项目；成功后确保 settings.packages[] 有条目。 */
  async install(req: {
    source: PackageInstallSource;
    scope: PackageScope;
    workspacePath?: string;
  }): Promise<PackageCommandResult> {
    if (!this.binary) throw new Error('未找到 pi 内核二进制，无法安装 Package');
    const spec = toSettingsSpec(req.source);
    const args = ['install', spec];
    if (req.scope === 'project') args.push('-l');
    const cwd = req.scope === 'project' ? (req.workspacePath ?? this.agentDir) : this.agentDir;
    const result = await this.runner(this.binary, args, {
      cwd,
      timeoutMs: INSTALL_TIMEOUT_MS,
    });
    const log = mergeLog(result);
    if (result.code === 0) {
      this.upsertEntry(spec, req.scope, req.workspacePath);
    }
    const views = await this.list(req.workspacePath);
    const parsed = parsePackageSource(spec, this.baseDirOf(req.scope, req.workspacePath));
    const view = views.find((v) => v.id === `${req.scope}:${parsed.identity}`);
    return {
      ok: result.code === 0,
      log,
      command: `pi ${args.join(' ')}`,
      ...(view ? { package: view } : {}),
    };
  }

  /** 卸载（README 8.5.1）：pi remove <src>，成功后清掉 settings.packages[] 对应条目。 */
  async uninstall(req: {
    source: string;
    scope: PackageScope;
    workspacePath?: string;
  }): Promise<PackageCommandResult> {
    if (!this.binary) throw new Error('未找到 pi 内核二进制，无法卸载 Package');
    const parsed = parsePackageSource(req.source, this.baseDirOf(req.scope, req.workspacePath));
    const spec = specOfParsed(parsed);
    const args = ['remove', spec];
    if (req.scope === 'project') args.push('-l');
    const cwd = req.scope === 'project' ? (req.workspacePath ?? this.agentDir) : this.agentDir;
    const result = await this.runner(this.binary, args, {
      cwd,
      timeoutMs: INSTALL_TIMEOUT_MS,
    });
    const log = mergeLog(result);
    if (result.code === 0) {
      this.removeEntry(parsed.identity, req.scope, req.workspacePath);
    }
    return { ok: result.code === 0, log, command: `pi ${args.join(' ')}` };
  }

  /** 更新（README 8.5.1）：pi update <src> 或 --extensions 批量；npm 带版本 spec 会被跳过，UI 需说明。 */
  async update(req: {
    source?: string;
    extensions?: boolean;
    scope: PackageScope;
    workspacePath?: string;
  }): Promise<PackageCommandResult> {
    if (!this.binary) throw new Error('未找到 pi 内核二进制，无法更新 Package');
    const args = ['update'];
    let note: string | undefined;
    if (req.extensions) {
      args.push('--extensions');
    } else if (req.source) {
      const parsed = parsePackageSource(req.source, this.baseDirOf(req.scope, req.workspacePath));
      if (parsed.sourceType === 'npm' && parsed.version) {
        note = 'npm 包带版本 spec 会被 pi 跳过；如需更新请去掉版本号';
      }
      args.push(specOfParsed(parsed));
    } else {
      throw new Error('请指定要更新的包，或勾选批量更新扩展');
    }
    if (req.scope === 'project') args.push('-l');
    const cwd = req.scope === 'project' ? (req.workspacePath ?? this.agentDir) : this.agentDir;
    const result = await this.runner(this.binary, args, {
      cwd,
      timeoutMs: INSTALL_TIMEOUT_MS,
    });
    return {
      ok: result.code === 0,
      log: mergeLog(result),
      command: `pi ${args.join(' ')}`,
      ...(note ? { note } : {}),
    };
  }

  /** 资源级启停：写 settings.packages[] 对象形式过滤（README 8.5.1 / 4.13）。 */
  async setFilter(req: {
    source: string;
    scope: PackageScope;
    filter: PackageResourceFilter;
    workspacePath?: string;
  }): Promise<PackageView> {
    const settingsFile = this.settingsFileOf(req.scope, req.workspacePath);
    const baseDir = this.baseDirOf(req.scope, req.workspacePath);
    const parsed = parsePackageSource(req.source, baseDir);
    const spec = specOfParsed(parsed);
    const settings = readPiSettings(settingsFile);
    const packages = Array.isArray(settings.packages) ? [...settings.packages] : [];
    const next: Record<string, unknown> = { source: spec };
    for (const key of ['extensions', 'skills', 'prompts', 'themes'] as const) {
      if (req.filter[key] !== undefined) next[key] = req.filter[key];
    }
    if (req.filter.autoload !== undefined) next.autoload = req.filter.autoload;
    const idx = packages.findIndex((item) => {
      const source = typeof item === 'string' ? item : (item as { source?: unknown }).source;
      return (
        typeof source === 'string' &&
        parsePackageSource(source, baseDir).identity === parsed.identity
      );
    });
    if (idx >= 0) packages[idx] = next;
    else packages.push(next);
    writePiSettings(settingsFile, { ...settings, packages });
    const views = await this.list(req.workspacePath);
    const view = views.find((v) => v.id === `${req.scope}:${parsed.identity}`);
    if (!view) throw new Error(`Package ${parsed.identity} 刷新失败`);
    return view;
  }
}
