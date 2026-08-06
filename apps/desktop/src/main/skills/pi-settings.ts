/**
 * pi settings.json 读写（README 4.3 / 8.4.1）：
 * 与 pi 共享同一文件，JSONC 容错 + 原子写（tmp + rename），保留用户手写字段。
 * skills[] 语义：`!glob` 排除、`+path` 精确强制包含、`-path` 精确强制排除；
 * 相对路径相对 settings 所在目录解析。
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface PiSettingsFile {
  skills?: string[];
  [key: string]: unknown;
}

function stripJsonc(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/(^|\s)\/\/.*$/, '$1'))
    .join('\n')
    .replace(/,\s*([}\]])/g, '$1');
}

export function readPiSettings(file: string): PiSettingsFile {
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as PiSettingsFile;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    try {
      const parsed = JSON.parse(stripJsonc(raw)) as PiSettingsFile;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
}

export function writePiSettings(file: string, data: PiSettingsFile): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  renameSync(tmp, file);
}

export function expandHome(value: string): string {
  return value.startsWith('~/') || value === '~'
    ? `${process.env.HOME ?? process.env.USERPROFILE ?? ''}${value.slice(1)}`
    : value;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** `*` 通配 glob 匹配（用于 skills[] 的 !pattern 判断）。 */
export function globMatch(value: string, pattern: string): boolean {
  const re = new RegExp(`^${pattern.split('*').map(escapeRegex).join('.*')}$`);
  return re.test(value);
}

/** skills 相对 settings 目录的路径（settings 约定，README 4.3）。 */
export function relativeSkillPath(settingsDir: string, skillPath: string): string {
  const rel = skillPath.startsWith(settingsDir)
    ? skillPath.slice(settingsDir.length).replace(/^[\\/]/, '')
    : skillPath;
  return rel.split('\\').join('/');
}

export function isSkillExcluded(entries: string[], relPath: string, absPath: string): boolean {
  return entries.some((entry) => {
    if (entry.startsWith('-')) {
      const target = entry.slice(1).split('\\').join('/');
      const expanded = expandHome(entry.slice(1)).split('\\').join('/');
      return (
        target === relPath ||
        target === absPath.split('\\').join('/') ||
        expanded === absPath.split('\\').join('/')
      );
    }
    if (entry.startsWith('!')) {
      const pattern = entry.slice(1).split('\\').join('/');
      return globMatch(relPath, pattern) || globMatch(absPath.split('\\').join('/'), pattern);
    }
    return false;
  });
}

export function addSkillExclusion(entries: string[], relPath: string): string[] {
  const marker = `-${relPath}`;
  if (entries.includes(marker)) return [...entries];
  return [...entries, marker];
}

export function removeSkillExclusion(
  entries: string[],
  relPath: string,
  absPath: string,
): string[] {
  return entries.filter((entry) => {
    if (entry === `-${relPath}`) return false;
    if (
      entry.startsWith('-') &&
      entry.slice(1).split('\\').join('/') === absPath.split('\\').join('/')
    ) {
      return false;
    }
    if (
      entry.startsWith('-') &&
      expandHome(entry.slice(1)).split('\\').join('/') === absPath.split('\\').join('/')
    ) {
      return false;
    }
    if (entry.startsWith('!')) {
      const pattern = entry.slice(1).split('\\').join('/');
      if (
        globMatch(relPath, pattern) ||
        globMatch(absPath.split('\\').join('/'), pattern) ||
        globMatch(expandHome(entry.slice(1)).split('\\').join('/'), pattern)
      ) {
        return false;
      }
    }
    return true;
  });
}
