import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GitignoreIndex, listDir, resolveRgBinary, searchFileNames } from './file-tree';

describe('GitignoreIndex（README 8.9 尊重 .gitignore）', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agentdesk-gitignore-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('根 .gitignore：*.log、/build/、!keep.log 否定', () => {
    writeFileSync(path.join(root, '.gitignore'), '*.log\n!keep.log\n/build/\n');
    const gi = new GitignoreIndex(root);
    expect(gi.ignored(path.join(root, 'a.log'), false)).toBe(true);
    expect(gi.ignored(path.join(root, 'src', 'b.log'), false)).toBe(true);
    expect(gi.ignored(path.join(root, 'keep.log'), false)).toBe(false);
    expect(gi.ignored(path.join(root, 'build'), true)).toBe(true);
    expect(gi.ignored(path.join(root, 'src', 'keep.log'), false)).toBe(false);
    expect(gi.ignored(path.join(root, 'src', 'main.ts'), false)).toBe(false);
  });

  it('嵌套 .gitignore 深层优先：浅层忽略 + 深层 ! 重新包含', () => {
    mkdirSync(path.join(root, 'sub'));
    writeFileSync(path.join(root, '.gitignore'), '*.tmp\n');
    writeFileSync(path.join(root, 'sub', '.gitignore'), '!keep.tmp\n');
    const gi = new GitignoreIndex(root);
    expect(gi.ignored(path.join(root, 'a.tmp'), false)).toBe(true);
    expect(gi.ignored(path.join(root, 'sub', 'b.tmp'), false)).toBe(true);
    expect(gi.ignored(path.join(root, 'sub', 'keep.tmp'), false)).toBe(false);
  });

  it('锚定模式相对 .gitignore 所在目录', () => {
    mkdirSync(path.join(root, 'sub'));
    writeFileSync(path.join(root, 'sub', '.gitignore'), '/only-here\n');
    const gi = new GitignoreIndex(root);
    expect(gi.ignored(path.join(root, 'sub', 'only-here'), false)).toBe(true);
    expect(gi.ignored(path.join(root, 'only-here'), false)).toBe(false);
  });
});

describe('listDir 懒加载列表（README 8.9 / M8）', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agentdesk-tree-'));
    mkdirSync(path.join(root, 'src'), { recursive: true });
    mkdirSync(path.join(root, 'zdir'), { recursive: true });
    writeFileSync(path.join(root, 'b.ts'), '');
    writeFileSync(path.join(root, 'a.log'), 'ignored');
    writeFileSync(path.join(root, '.env'), 'secret');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('一层列表：目录在前 + 字母序、hidden 标记、跳过 .git 与 gitignore', () => {
    writeFileSync(path.join(root, '.gitignore'), '*.log\n');
    const entries = listDir(root);
    expect(entries.map((e) => e.name)).toEqual(['src', 'zdir', '.env', '.gitignore', 'b.ts']);
    expect(entries.find((e) => e.name === '.env')?.hidden).toBe(true);
    expect(entries.find((e) => e.name === '.gitignore')?.hidden).toBe(true);
    expect(entries.find((e) => e.name === 'src')?.kind).toBe('dir');
    expect(entries.find((e) => e.name === 'b.ts')?.kind).toBe('file');
    expect(entries.some((e) => e.name === 'a.log')).toBe(false);
    expect(entries.some((e) => e.name === '.git')).toBe(false);
  });

  it('子目录用树根解析 .gitignore（root 参数）', () => {
    writeFileSync(path.join(root, '.gitignore'), 'src/keep.txt\n');
    writeFileSync(path.join(root, 'src', 'keep.txt'), '');
    writeFileSync(path.join(root, 'src', 'other.txt'), '');
    const entries = listDir(path.join(root, 'src'), { root });
    expect(entries.map((e) => e.name)).toEqual(['other.txt']);
  });
});

describe('searchFileNames（rg 缺失时 Node 回退）', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agentdesk-search-'));
    mkdirSync(path.join(root, 'src'), { recursive: true });
    mkdirSync(path.join(root, 'dist'), { recursive: true });
    writeFileSync(path.join(root, 'src', 'foo.ts'), '');
    writeFileSync(path.join(root, 'src', 'bar.ts'), '');
    writeFileSync(path.join(root, 'dist', 'foo.js'), '');
    writeFileSync(path.join(root, '.gitignore'), 'dist/\n');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('回退搜索匹配文件名并尊重 .gitignore', async () => {
    const matches = await searchFileNames({ root, query: 'foo', rg: null });
    expect(matches.some((m) => m.path.endsWith('foo.ts'))).toBe(true);
    expect(matches.some((m) => m.path.endsWith('foo.js'))).toBe(false);
  });

  it('空查询返回空', async () => {
    expect(await searchFileNames({ root, query: '   ', rg: null })).toEqual([]);
  });
});

describe('resolveRgBinary（README 4.15：pi 托管优先）', () => {
  it('agentDir/bin/rg 存在时命中，无 agentDir 返回 null', () => {
    const agent = mkdtempSync(path.join(tmpdir(), 'agentdesk-rg-'));
    mkdirSync(path.join(agent, 'bin'), { recursive: true });
    const name = process.platform === 'win32' ? 'rg.exe' : 'rg';
    writeFileSync(path.join(agent, 'bin', name), '');
    expect(resolveRgBinary(agent)).toBe(path.join(agent, 'bin', name));
    expect(resolveRgBinary()).toBeNull();
    rmSync(agent, { recursive: true, force: true });
  });
});
