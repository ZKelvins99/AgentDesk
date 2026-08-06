/**
 * Extension 兼容性标注（README 8.5.2）：
 * pi 扩展可以调用只在终端 TUI 下有意义的 API，AgentDesk 必须诚实标注但不阻止加载。
 * 判定方式：静态扫描扩展源码的 API 调用（best-effort 词法扫描）+ 运行时捕获
 * （Extension UI 请求里出现无法映射的类型时降级并记录）。
 * 等级优先级：TUI_ONLY > DEGRADED > PARTIAL > FULL。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { expandHome, readPiSettings } from '../skills/pi-settings';

export type ExtensionCompatLevel = 'FULL' | 'PARTIAL' | 'DEGRADED' | 'TUI_ONLY';
export type ExtensionSource = 'global' | 'project' | 'configured';

export interface ExtensionCompatIssue {
  api: string;
  level: ExtensionCompatLevel;
  line: number | null;
  snippet?: string;
}

export interface ExtensionCompatReport {
  level: ExtensionCompatLevel;
  issues: ExtensionCompatIssue[];
}

export interface ExtensionEntry {
  id: string;
  name: string;
  path: string;
  source: ExtensionSource;
}

export interface ExtensionRuntimeNote {
  at: string;
  kind: 'ui.request' | 'extension.error';
  detail: string;
  extensionPath?: string;
}

export interface ExtensionCompatView extends ExtensionEntry {
  level: ExtensionCompatLevel;
  issues: ExtensionCompatIssue[];
  runtimeNotes: ExtensionRuntimeNote[];
}

export interface ExtensionCompatListResult {
  extensions: ExtensionCompatView[];
  /** 无法归属到具体扩展文件的运行时观察（如无 extensionPath 的 UI 请求）。 */
  runtimeNotes: ExtensionRuntimeNote[];
}

const EXT_FILE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const INDEX_NAMES = ['index.ts', 'index.tsx', 'index.js', 'index.jsx'];

/** README 8.5.2 PARTIAL：映射到桌面状态栏/侧栏小组件，可能样式受限。 */
const PARTIAL_APIS = ['setStatus', 'setWidget', 'setTitle', 'set_editor_text'] as const;
/** README 8.5.2 DEGRADED：返回 TUI Component，渲染降级为纯文本/JSON。 */
const DEGRADED_APIS = [
  'registerMessageRenderer',
  'registerEntryRenderer',
  'registerMarkdownTransformer',
] as const;
/** README 8.5.2 TUI_ONLY：依赖终端按键 / 自定义 Component / Overlay。 */
const TUI_ONLY_APIS = ['registerShortcut'] as const;
const TUI_ONLY_IDENTIFIERS = ['Component', 'Overlay'] as const;

/** 桌面端可完整映射的运行时 UI 请求（FULL 集）。 */
const MAPPABLE_UI_KINDS = new Set(['confirm', 'select', 'input', 'notify']);
/** PARTIAL 运行时 UI 请求：桌面端有映射但样式受限。 */
const PARTIAL_UI_KINDS = new Set(['setStatus', 'setWidget', 'setTitle', 'set_editor_text']);

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function lineOf(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (source.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

/** 扫描源码中匹配的 API 调用（best-effort，只看词法形态不解析类型）。 */
function matchApis(
  source: string,
  apis: readonly string[],
  level: ExtensionCompatLevel,
  identifiersOnly = false,
): ExtensionCompatIssue[] {
  const issues: ExtensionCompatIssue[] = [];
  for (const api of apis) {
    const re = identifiersOnly
      ? new RegExp(`\\b${escapeRegex(api)}\\b`)
      : new RegExp(`\\b${escapeRegex(api)}\\s*\\(`);
    const match = re.exec(source);
    if (!match) continue;
    const start = match.index;
    const line = lineOf(source, start);
    const snippet = source
      .slice(start, Math.min(source.length, start + 90))
      .split(/\r?\n/)[0]
      ?.trim();
    issues.push({
      api,
      level,
      line,
      ...(snippet ? { snippet } : {}),
    });
  }
  return issues;
}

/** 静态扫描单个扩展源码：只标注，不阻止加载。 */
export function scanExtensionSource(source: string): ExtensionCompatReport {
  const issues = [
    ...matchApis(source, PARTIAL_APIS, 'PARTIAL'),
    ...matchApis(source, DEGRADED_APIS, 'DEGRADED'),
    ...matchApis(source, TUI_ONLY_APIS, 'TUI_ONLY'),
    ...matchApis(source, TUI_ONLY_IDENTIFIERS, 'TUI_ONLY', true),
  ];
  const level: ExtensionCompatLevel = issues.some((i) => i.level === 'TUI_ONLY')
    ? 'TUI_ONLY'
    : issues.some((i) => i.level === 'DEGRADED')
      ? 'DEGRADED'
      : issues.some((i) => i.level === 'PARTIAL')
        ? 'PARTIAL'
        : 'FULL';
  return { level, issues };
}

function entryOf(dir: string, name: string, source: ExtensionSource): ExtensionEntry | null {
  const full = path.join(dir, name);
  let stat: ReturnType<typeof statSync> | null = null;
  try {
    stat = statSync(full);
  } catch {
    return null;
  }
  if (stat.isFile()) {
    if (!EXT_FILE_EXTENSIONS.has(path.extname(name).toLowerCase())) return null;
    return { id: name, name, path: full, source };
  }
  if (stat.isDirectory()) {
    let children: string[] = [];
    try {
      children = readdirSync(full);
    } catch {
      children = [];
    }
    const index =
      children.find((f) => INDEX_NAMES.includes(f.toLowerCase())) ??
      children.filter((f) => EXT_FILE_EXTENSIONS.has(path.extname(f).toLowerCase())).sort()[0];
    if (!index) return null;
    return {
      id: path.join(name, index).split(path.sep).join('/'),
      name,
      path: path.join(full, index),
      source,
    };
  }
  return null;
}

function scanDir(dir: string, source: ExtensionSource): ExtensionEntry[] {
  let names: string[] = [];
  try {
    names = readdirSync(dir)
      .filter((n) => n !== '.git' && n !== 'node_modules')
      .sort();
  } catch {
    return [];
  }
  const entries: ExtensionEntry[] = [];
  for (const name of names) {
    const entry = entryOf(dir, name, source);
    if (entry) entries.push(entry);
  }
  return entries;
}

/** settings.extensions[] 里的显式路径（可能含 ~、相对路径）。 */
function configuredEntries(
  settingsFile: string,
  baseDir: string,
  source: ExtensionSource,
): ExtensionEntry[] {
  const entries = (readPiSettings(settingsFile).extensions ?? []) as unknown[];
  const out: ExtensionEntry[] = [];
  for (const raw of entries) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const expanded = expandHome(raw.trim());
    const full = path.resolve(baseDir, expanded);
    const name = path.basename(full);
    const entry = entryOf(path.dirname(full), name, source);
    if (entry) out.push(entry);
  }
  return out;
}

/** 收集扩展入口：全局/项目 extensions 目录（一层）+ settings.extensions[] 显式路径。 */
export function collectExtensionEntries(
  agentDir: string,
  workspacePath?: string,
): ExtensionEntry[] {
  const entries = [
    ...scanDir(path.join(agentDir, 'extensions'), 'global'),
    ...(workspacePath ? scanDir(path.join(workspacePath, '.pi', 'extensions'), 'project') : []),
    ...configuredEntries(path.join(agentDir, 'settings.json'), agentDir, 'configured'),
    ...(workspacePath
      ? configuredEntries(
          path.join(workspacePath, '.pi', 'settings.json'),
          workspacePath,
          'configured',
        )
      : []),
  ];
  const seen = new Set<string>();
  const unique: ExtensionEntry[] = [];
  for (const entry of entries) {
    const key = path.resolve(entry.path).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(entry);
  }
  return unique;
}

/** 运行时捕获：Extension UI 请求无法映射 / extension_error 时记录（README 8.5.2）。 */
export class ExtensionCompatTracker {
  private notes: ExtensionRuntimeNote[] = [];
  private readonly maxNotes: number;

  constructor(maxNotes = 200) {
    this.maxNotes = maxNotes;
  }

  private push(note: ExtensionRuntimeNote): void {
    this.notes.push(note);
    if (this.notes.length > this.maxNotes) {
      this.notes = this.notes.slice(this.notes.length - this.maxNotes);
    }
  }

  /** 运行时 UI 请求：可完整映射则忽略；PARTIAL/editor/未知类型分别记录。 */
  recordUiRequest(kind: string, payload?: unknown): void {
    if (MAPPABLE_UI_KINDS.has(kind)) return;
    if (PARTIAL_UI_KINDS.has(kind)) {
      this.push({
        at: new Date().toISOString(),
        kind: 'ui.request',
        detail: `扩展请求了 PARTIAL API ${kind}：桌面端映射到状态栏/侧栏小组件，可能样式受限`,
      });
      return;
    }
    if (kind === 'editor') {
      this.push({
        at: new Date().toISOString(),
        kind: 'ui.request',
        detail: '扩展请求了自定义编辑器（TUI_ONLY）：桌面端不可用',
      });
      return;
    }
    this.push({
      at: new Date().toISOString(),
      kind: 'ui.request',
      detail: `扩展请求了无法映射的 UI 类型「${kind}」：桌面端降级（payload ${JSON.stringify(payload ?? null).slice(0, 200)}）`,
    });
  }

  recordExtensionError(extensionPath: string | undefined, message: string): void {
    this.push({
      at: new Date().toISOString(),
      kind: 'extension.error',
      detail: message.slice(0, 500),
      ...(extensionPath ? { extensionPath } : {}),
    });
  }

  all(): ExtensionRuntimeNote[] {
    return [...this.notes];
  }

  notesFor(extensionPath: string): ExtensionRuntimeNote[] {
    const resolved = path.resolve(extensionPath).toLowerCase();
    return this.notes.filter(
      (n) => n.extensionPath && path.resolve(n.extensionPath).toLowerCase() === resolved,
    );
  }

  clear(): void {
    this.notes = [];
  }
}

export class ExtensionCompatService {
  private readonly agentDir: string;
  private readonly tracker: ExtensionCompatTracker;

  constructor(agentDir: string, tracker = new ExtensionCompatTracker()) {
    this.agentDir = agentDir;
    this.tracker = tracker;
  }

  list(workspacePath?: string): ExtensionCompatListResult {
    const extensions: ExtensionCompatView[] = [];
    for (const entry of collectExtensionEntries(this.agentDir, workspacePath)) {
      let report: ExtensionCompatReport;
      try {
        report = scanExtensionSource(readFileSync(entry.path, 'utf8'));
      } catch {
        report = {
          level: 'DEGRADED',
          issues: [{ api: '读取失败', level: 'DEGRADED', line: null }],
        };
      }
      extensions.push({
        ...entry,
        ...report,
        runtimeNotes: this.tracker.notesFor(entry.path),
      });
    }
    return {
      extensions,
      runtimeNotes: this.tracker.all().filter((n) => !n.extensionPath),
    };
  }

  runtimeTracker(): ExtensionCompatTracker {
    return this.tracker;
  }
}
