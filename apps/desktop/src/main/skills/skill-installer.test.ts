import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collectCandidates, importCandidates } from './skill-installer';
import { SkillManager } from './skill-manager';

const MD = (name: string, desc: string): string =>
  `---\nname: ${name}\ndescription: ${desc}\n---\n正文`;

describe('skill-installer（README 8.4.2）', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agentdesk-install-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('collectCandidates 收集目录技能与 skills 根下文件技能', () => {
    const src = path.join(root, 'src');
    mkdirSync(path.join(src, 'one'), { recursive: true });
    mkdirSync(path.join(src, 'skills', 'nested'), { recursive: true });
    writeFileSync(path.join(src, 'one', 'SKILL.md'), MD('one', '技能一，描述足够长以便于加载。'));
    writeFileSync(
      path.join(src, 'skills', 'nested', 'SKILL.md'),
      MD('nested', '技能二，描述足够长以便于加载。'),
    );
    writeFileSync(
      path.join(src, 'skills', 'single.md'),
      MD('single', '技能三，描述足够长以便于加载。'),
    );

    const candidates = collectCandidates(src);
    const names = candidates.map((c) => c.name).sort();
    expect(names).toEqual(['nested', 'one', 'single']);
    expect(candidates.find((c) => c.name === 'single')?.kind).toBe('file');
  });

  it('importCandidates 复制到目标并跳过重名', () => {
    const src = path.join(root, 'src');
    const target = path.join(root, 'skills');
    mkdirSync(path.join(src, 'a', 'scripts'), { recursive: true });
    writeFileSync(path.join(src, 'a', 'SKILL.md'), MD('a', '技能甲，描述足够长以便于加载。'));
    writeFileSync(path.join(src, 'a', 'scripts', 'run.sh'), '#!/bin/sh\n');

    const candidates = collectCandidates(src);
    const outcome = importCandidates(candidates, target);
    expect(outcome.installed).toHaveLength(1);
    expect(existsSync(path.join(target, 'a', 'scripts', 'run.sh'))).toBe(true);

    const again = importCandidates(candidates, target);
    expect(again.installed).toHaveLength(1);
    expect(existsSync(path.join(target, 'a-2', 'SKILL.md'))).toBe(true);
  });

  it('SkillManager.install 从目录导入并回映 SkillView', () => {
    const agentDir = path.join(root, 'home', '.pi', 'agent');
    mkdirSync(path.join(agentDir, 'skills'), { recursive: true });
    const src = path.join(root, 'repo');
    mkdirSync(path.join(src, 'hello'), { recursive: true });
    writeFileSync(
      path.join(src, 'hello', 'SKILL.md'),
      MD('hello', '导入测试技能，描述足够长以便于加载。'),
    );

    const manager = new SkillManager({ agentDir, homeDir: path.join(root, 'home') });
    const result = manager.install({ source: { type: 'dir', path: src }, scope: 'global' });
    expect(result.installed).toHaveLength(1);
    expect(result.installed[0]?.name).toBe('hello');
    expect(result.installed[0]?.source).toBe('global');
    expect(existsSync(path.join(agentDir, 'skills', 'hello', 'SKILL.md'))).toBe(true);

    const again = manager.install({ source: { type: 'dir', path: src }, scope: 'global' });
    expect(again.installed).toHaveLength(1);
    expect(path.basename(again.installed[0]?.dir ?? '')).toBe('hello-2');
  });

  it('recommended 返回内置推荐源', () => {
    const manager = new SkillManager({ agentDir: path.join(root, 'agent') });
    const sources = manager.recommended();
    expect(sources.map((s) => s.name)).toContain('anthropics/skills');
    expect(sources.map((s) => s.name)).toContain('badlogic/pi-skills');
  });
});
