import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addSkillExclusion,
  globMatch,
  isSkillExcluded,
  readPiSettings,
  relativeSkillPath,
  removeSkillExclusion,
  writePiSettings,
} from './pi-settings';

describe('pi-settings（README 4.3 / 8.4.1）', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agentdesk-pi-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('readPiSettings 容忍 JSONC 注释与尾逗号，缺失文件返回 {}', () => {
    const file = path.join(root, 'settings.json');
    writeFileSync(file, '{\n  // pi 注释\n  "skills": ["-skills/a"],\n}\n');
    const s = readPiSettings(file);
    expect(s.skills).toEqual(['-skills/a']);
    expect(readPiSettings(path.join(root, 'missing.json'))).toEqual({});
  });

  it('writePiSettings 原子写并保留其他字段', () => {
    const file = path.join(root, 'settings.json');
    writePiSettings(file, { skills: ['-skills/a'], theme: 'dark' });
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as {
      skills?: string[];
      theme?: string;
    };
    expect(parsed.skills).toEqual(['-skills/a']);
    expect(parsed.theme).toBe('dark');
  });

  it('排除规则：-path 精确、!glob 通配、+path 不排除', () => {
    expect(isSkillExcluded(['-skills/a'], 'skills/a', 'C:/x/skills/a')).toBe(true);
    expect(isSkillExcluded(['-skills/a'], 'skills/b', 'C:/x/skills/b')).toBe(false);
    expect(isSkillExcluded(['!skills/*'], 'skills/a', 'C:/x/skills/a')).toBe(true);
    expect(isSkillExcluded(['!skills/*'], 'skills/a/b', 'C:/x/skills/a/b')).toBe(true);
    expect(isSkillExcluded(['!skills/x*'], 'skills/y', 'C:/x/skills/y')).toBe(false);
    expect(isSkillExcluded(['+skills/a'], 'skills/a', 'C:/x/skills/a')).toBe(false);
  });

  it('globMatch 星号匹配', () => {
    expect(globMatch('skills/foo', 'skills/*')).toBe(true);
    expect(globMatch('skills/foo/bar', 'skills/*')).toBe(true);
    expect(globMatch('skills2/foo', 'skills/*')).toBe(false);
  });

  it('add/removeSkillExclusion 增删精确排除', () => {
    const list = addSkillExclusion([], 'skills/a');
    expect(list).toEqual(['-skills/a']);
    const again = addSkillExclusion(list, 'skills/a');
    expect(again).toEqual(['-skills/a']);
    const removed = removeSkillExclusion(again, 'skills/a', 'C:/x/skills/a');
    expect(removed).toEqual([]);
  });

  it('relativeSkillPath 相对 settings 目录归一化', () => {
    expect(relativeSkillPath('C:/x', 'C:/x/skills/a')).toBe('skills/a');
    expect(relativeSkillPath('C:/x', 'C:/other/a')).toBe('C:/other/a');
  });
});
