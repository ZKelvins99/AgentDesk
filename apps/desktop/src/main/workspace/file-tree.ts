/**
 * 文件树服务（README 8.9 / M8）：
 * - 懒加载：按目录一次只列一层（UI 展开时再取子层）
 * - 尊重 .gitignore：自根向下列出各级 .gitignore，深层规则优先（含 ! 重新包含）
 * - 搜索：优先 pi 托管的 ~/.pi/agent/bin/rg（README 4.15），其次 PATH 上的 rg，缺失时 Node 回退
 */
import { execFile } from 'node:child_process';
import { type Dirent, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import ignore, { type Ignore } from 'ignore';

const execFileAsync = promisify(execFile);

export type FileEntryKind = 'file' | 'dir';

export interface FileTreeEntry {
  name: string;
  path: string;
  kind: FileEntryKind;
  size: number | null;
  hidden: boolean;
}

export interface FileSearchMatch {
  path: string;
}

export interface ListDirOptions {
  /** .gitignore 解析的根（树根，通常是 workspacePath）；缺省用被列目录自身。 */
  root?: string;
}

export interface SearchFileNamesOptions {
  root: string;
  query: string;
  rg?: string | null;
  maxResults?: number;
}

/** pi 托管的 rg 二进制（README 4.15：~/.pi/agent/bin/rg）。 */
export function resolveRgBinary(agentDir?: string): string | null {
  if (!agentDir) return null;
  const bin = path.join(agentDir, 'bin', process.platform === 'win32' ? 'rg.exe' : 'rg');
  return existsSync(bin) ? bin : null;
}

/** 解析可用 rg：pi 托管 > PATH（where/which）；都没有返回 null（调用方走 Node 回退）。 */
export async function findRg(agentDir?: string): Promise<string | null> {
  const bundled = resolveRgBinary(agentDir);
  if (bundled) return bundled;
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    const { stdout } = await execFileAsync(cmd, ['rg'], {
      windowsHide: true,
      timeout: 5_000,
    });
    const first = stdout
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find(Boolean);
    if (first) return first;
  } catch {
    // rg 不在 PATH
  }
  return null;
}

/**
 * .gitignore 解析器：按目录缓存 matcher，测试条目时自底向上应用
 * 规则全部合并进同一个 matcher（根 → 目录顺序），深层 `!` 否定可重新包含浅层忽略的路径。
 */
export class GitignoreIndex {
  private readonly cache = new Map<string, Ignore | null>();

  constructor(private readonly root: string) {}

  /** 把某层 .gitignore 规则转成相对树根的匹配（非锚定简单模式加双星前缀以任意深度生效）。 */
  private shiftPattern(pattern: string, relFromRoot: string): string {
    const negated = pattern.startsWith('!');
    let body = negated ? pattern.slice(1) : pattern;
    const dirOnly = body.endsWith('/');
    if (dirOnly) body = body.slice(0, -1);
    const anchored = body.startsWith('/');
    let shifted: string;
    if (anchored) {
      shifted = relFromRoot ? `${relFromRoot}${body}` : body.slice(1);
    } else if (body.includes('/')) {
      shifted = relFromRoot ? `${relFromRoot}/${body}` : body;
    } else {
      shifted = relFromRoot ? `${relFromRoot}/**/${body}` : `**/${body}`;
    }
    if (dirOnly) shifted = `${shifted}/`;
    return negated ? `!${shifted}` : shifted;
  }

  /** 自根到 dir 的所有 .gitignore 合并成一个 matcher（相对树根匹配）。 */
  private combinedMatcher(dir: string): Ignore | null {
    const cached = this.cache.get(dir);
    if (cached !== undefined) return cached;
    const rel = path.relative(this.root, dir).split('\\').join('/');
    const dirs: string[] = [this.root];
    if (rel) {
      for (const part of rel.split('/')) {
        const last = dirs[dirs.length - 1] ?? this.root;
        dirs.push(path.join(last, part));
      }
    }
    const patterns: string[] = [];
    for (const d of dirs) {
      let raw: string;
      try {
        raw = readFileSync(path.join(d, '.gitignore'), 'utf8');
      } catch {
        continue;
      }
      const relFromRoot = path.relative(this.root, d).split('\\').join('/');
      for (const line of raw.split(/\r?\n/)) {
        const p = line.trimEnd();
        if (!p || p.startsWith('#')) continue;
        patterns.push(this.shiftPattern(p, relFromRoot));
      }
    }
    const matcher = patterns.length > 0 ? ignore().add(patterns) : null;
    this.cache.set(dir, matcher);
    return matcher;
  }

  /** absPath 是否被 .gitignore 忽略；isDir 用于目录专用模式（尾部 /）。 */
  ignored(absPath: string, isDir: boolean): boolean {
    const parent = path.dirname(absPath);
    const matcher = this.combinedMatcher(parent);
    if (!matcher) return false;
    const rel = path.relative(this.root, absPath).split('\\').join('/');
    if (!rel || rel.startsWith('..')) return false;
    return matcher.ignores(isDir ? `${rel}/` : rel);
  }
}

/** 懒加载目录列表：一层，跳过 .git，应用 .gitignore，目录在前 + 字母序，dotfile 标记 hidden。 */
export function listDir(dir: string, options: ListDirOptions = {}): FileTreeEntry[] {
  const root = options.root ?? dir;
  const gitignore = new GitignoreIndex(root);
  let entries: Dirent[] = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.name !== '.git')
    .filter((entry) => {
      const abs = path.join(dir, entry.name);
      return !gitignore.ignored(abs, entry.isDirectory());
    })
    .map((entry) => {
      const abs = path.join(dir, entry.name);
      let size: number | null = null;
      if (entry.isFile()) {
        try {
          size = statSync(abs).size;
        } catch {
          size = null;
        }
      }
      return {
        name: entry.name,
        path: abs,
        kind: entry.isDirectory() ? ('dir' as const) : ('file' as const),
        size,
        hidden: entry.name.startsWith('.'),
      };
    })
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1));
}

const MAX_SEARCH_RESULTS = 200;
const MAX_SEARCH_DEPTH = 24;

/** 文件名搜索：rg --files（自带 .gitignore）→ Node 端匹配；rg 缺失时全 Node 回退。 */
export async function searchFileNames(options: SearchFileNamesOptions): Promise<FileSearchMatch[]> {
  const query = options.query.trim().toLowerCase();
  if (!query) return [];
  const max = options.maxResults ?? MAX_SEARCH_RESULTS;
  if (options.rg) {
    try {
      const { stdout } = await execFileAsync(
        options.rg,
        ['--files', '--no-messages', options.root],
        {
          windowsHide: true,
          timeout: 15_000,
          maxBuffer: 50 * 1024 * 1024,
        },
      );
      return stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => line.toLowerCase().includes(query))
        .slice(0, max)
        .map((line) => ({
          path: path.isAbsolute(line) ? line : path.join(options.root, line),
        }));
    } catch {
      // rg 无匹配时退出码 1，视为空结果
    }
  }
  const gitignore = new GitignoreIndex(options.root);
  const out: FileSearchMatch[] = [];
  const walk = (dir: string, depth: number): void => {
    if (out.length >= max || depth > MAX_SEARCH_DEPTH) return;
    let entries: Dirent[] = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const abs = path.join(dir, entry.name);
      if (gitignore.ignored(abs, entry.isDirectory())) continue;
      if (entry.name.toLowerCase().includes(query)) out.push({ path: abs });
      if (entry.isDirectory()) walk(abs, depth + 1);
    }
  };
  walk(options.root, 0);
  return out.slice(0, max);
}

export class FileTreeService {
  private readonly agentDir: string | undefined;

  constructor(agentDir?: string) {
    this.agentDir = agentDir;
  }

  listDir(req: { path: string; root?: string }): { entries: FileTreeEntry[] } {
    return {
      entries: listDir(req.path, {
        ...(req.root !== undefined ? { root: req.root } : {}),
      }),
    };
  }

  async search(req: {
    root: string;
    query: string;
    maxResults?: number;
  }): Promise<{ matches: FileSearchMatch[] }> {
    const rg = await findRg(this.agentDir);
    return { matches: await searchFileNames({ ...req, rg }) };
  }
}
