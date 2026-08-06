/**
 * Skill 安装（README 8.4.2 / 8.4.3）：Git 仓库 / 本地 zip / 目录导入。
 * - git：`git clone --depth 1 [--branch ref]` 到临时目录后扫描
 * - zip：系统 tar 解压到临时目录后扫描（Windows 10+ / macOS / Linux 均内置）
 * - 目录：直接扫描
 * 安装 = 复制文件到 settingsDir/skills/<name>，不改动用户已有技能；重名跳过。
 */

import { execFileSync } from 'node:child_process';
import {
  cpSync,
  type Dirent,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseSkillFrontmatter, SKILL_NAME_RE } from './frontmatter';

export type InstallSource =
  | { type: 'dir'; path: string }
  | { type: 'zip'; path: string }
  | { type: 'git'; url: string; ref?: string };

export interface SkillCandidate {
  kind: 'dir' | 'file';
  path: string;
  name: string;
}

export interface InstallOutcome {
  installed: string[];
  skipped: Array<{ name: string; reason: string }>;
}

const MAX_SCAN_DEPTH = 4;

function sanitizeName(value: string): string {
  const name = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return name || 'skill';
}

function readSkillName(mdPath: string, fallback: string): string {
  try {
    const parsed = parseSkillFrontmatter(readFileSync(mdPath, 'utf8'));
    if (parsed.frontmatter.name && SKILL_NAME_RE.test(parsed.frontmatter.name)) {
      return parsed.frontmatter.name;
    }
  } catch {
    // 读取失败走 fallback
  }
  return sanitizeName(fallback);
}

/** 扫描根目录，收集含 SKILL.md 的目录技能与（skills 根下）单文件技能。 */
export function collectCandidates(root: string): SkillCandidate[] {
  if (!existsSync(root)) return [];
  const out: SkillCandidate[] = [];
  const visit = (dir: string, depth: number): void => {
    if (depth > MAX_SCAN_DEPTH) return;
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const md = path.join(dir, 'SKILL.md');
    if (existsSync(md)) {
      out.push({ kind: 'dir', path: dir, name: readSkillName(md, path.basename(dir)) });
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '.git' || entry.name === 'node_modules') continue;
        visit(full, depth + 1);
      } else if (entry.name.endsWith('.md') && path.basename(dir) === 'skills') {
        out.push({
          kind: 'file',
          path: full,
          name: readSkillName(full, path.basename(full, '.md')),
        });
      }
    }
  };
  visit(root, 0);
  return out;
}

function copyCandidate(candidate: SkillCandidate, target: string): void {
  if (candidate.kind === 'dir') {
    cpSync(candidate.path, target, { recursive: true });
  } else {
    cpSync(candidate.path, target);
  }
}

/** 把候选技能导入目标 skills 目录；重名或同名冲突跳过。 */
export function importCandidates(
  candidates: SkillCandidate[],
  targetSkillsDir: string,
): InstallOutcome {
  const outcome: InstallOutcome = { installed: [], skipped: [] };
  const used = new Set<string>();
  for (const candidate of candidates) {
    let name = candidate.name;
    if (used.has(name)) {
      outcome.skipped.push({ name, reason: '来源内重名，跳过后续同名项' });
      continue;
    }
    let suffix = 2;
    while (existsSync(path.join(targetSkillsDir, name))) {
      name = `${candidate.name}-${suffix}`;
      suffix += 1;
    }
    used.add(name);
    const target = path.join(targetSkillsDir, name);
    try {
      copyCandidate(candidate, target);
      outcome.installed.push(target);
    } catch {
      outcome.skipped.push({ name, reason: '复制失败' });
    }
  }
  return outcome;
}

/** 解压 / 克隆后返回可扫描根目录；调用方负责清理临时目录。 */
export function materializeSource(source: InstallSource): { root: string; cleanup: () => void } {
  if (source.type === 'dir') {
    return { root: source.path, cleanup: () => undefined };
  }
  const temp = mkdtempSync(path.join(tmpdir(), 'agentdesk-skill-install-'));
  if (source.type === 'zip') {
    try {
      execFileSync('tar', ['-xf', source.path, '-C', temp], { stdio: 'pipe' });
    } catch (error) {
      rmSync(temp, { recursive: true, force: true });
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`zip 解压失败（需系统 tar 支持）：${detail}`);
    }
    return { root: temp, cleanup: () => rmSync(temp, { recursive: true, force: true }) };
  }
  const args = ['clone', '--depth', '1'];
  if (source.ref) args.push('--branch', source.ref);
  args.push(source.url, temp);
  try {
    execFileSync('git', args, { stdio: 'pipe' });
  } catch (error) {
    rmSync(temp, { recursive: true, force: true });
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`git clone 失败：${detail}`);
  }
  return { root: temp, cleanup: () => rmSync(temp, { recursive: true, force: true }) };
}
