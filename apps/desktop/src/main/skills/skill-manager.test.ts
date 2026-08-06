import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SkillManager } from './skill-manager';

const SKILL_MD = (name: string, desc: string): string =>
  `---\nname: ${name}\ndescription: ${desc}\n---\n正文`;

describe('SkillManager（README 8.4.1）', () => {
  let root: string;
  let agentDir: string;
  let ws: string;
  let manager: SkillManager;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agentdesk-skills-'));
    agentDir = path.join(root, 'home', '.pi', 'agent');
    ws = path.join(root, 'ws');
    mkdirSync(path.join(agentDir, 'skills', 'alpha'), { recursive: true });
    mkdirSync(path.join(agentDir, 'skills', 'nested', 'deep'), { recursive: true });
    mkdirSync(path.join(ws, '.pi', 'skills', 'beta'), { recursive: true });
    mkdirSync(path.join(ws, '.pi', 'skills', 'broken'), { recursive: true });
    writeFileSync(
      path.join(agentDir, 'skills', 'alpha', 'SKILL.md'),
      SKILL_MD('alpha', '全局技能'),
    );
    writeFileSync(
      path.join(agentDir, 'skills', 'nested', 'deep', 'SKILL.md'),
      SKILL_MD('deep-skill', '深层全局技能'),
    );
    writeFileSync(
      path.join(agentDir, 'skills', 'root-file.md'),
      SKILL_MD('root-file', '全局文件技能'),
    );
    writeFileSync(path.join(ws, '.pi', 'skills', 'beta', 'SKILL.md'), SKILL_MD('beta', '项目技能'));
    writeFileSync(
      path.join(ws, '.pi', 'skills', 'broken', 'SKILL.md'),
      '---\nname: BAD NAME\ndescription: d\n---\n',
    );
    manager = new SkillManager({ agentDir, homeDir: path.join(root, 'home') });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('发现全局与项目技能：目录技能递归 + 根层文件技能', () => {
    const views = manager.list(ws);
    const names = views.map((v) => v.name).sort();
    expect(names).toEqual(['BAD NAME', 'alpha', 'beta', 'deep-skill', 'root-file']);

    const alpha = views.find((v) => v.name === 'alpha');
    expect(alpha?.source).toBe('global');
    expect(alpha?.scope).toBe('global');
    expect(alpha?.kind).toBe('dir');
    expect(alpha?.status).toBe('active');

    const beta = views.find((v) => v.name === 'beta');
    expect(beta?.source).toBe('project');
    expect(beta?.scope).toBe('workspace');

    const deep = views.find((v) => v.name === 'deep-skill');
    expect(deep?.source).toBe('global');
    expect(deep?.kind).toBe('dir');

    const rootFile = views.find((v) => v.name === 'root-file');
    expect(rootFile?.kind).toBe('file');
    expect(rootFile?.status).toBe('active');
  });

  it('invalid 技能标红并给出错误', () => {
    const broken = manager.list(ws).find((v) => v.name === 'BAD NAME');
    expect(broken?.status).toBe('invalid');
    expect(broken?.errors.length).toBeGreaterThan(0);
  });

  it('settings.skills[] 排除后标记 disabled，setEnabled 写文件并可恢复', () => {
    const alpha = manager.list(ws).find((v) => v.name === 'alpha');
    expect(alpha?.status).toBe('active');
    if (!alpha) throw new Error('alpha 未发现');

    const disabled = manager.setEnabled(alpha.id, false, ws);
    expect(disabled.status).toBe('disabled');

    const settings = JSON.parse(readFileSync(path.join(agentDir, 'settings.json'), 'utf8')) as {
      skills?: string[];
    };
    expect(settings.skills).toContain('-skills/alpha');

    const enabled = manager.setEnabled(alpha.id, true, ws);
    expect(enabled.status).toBe('active');
  });

  it('项目技能排除写入项目 settings.json', () => {
    const beta = manager.list(ws).find((v) => v.name === 'beta');
    if (!beta) throw new Error('beta 未发现');
    const disabled = manager.setEnabled(beta.id, false, ws);
    expect(disabled.status).toBe('disabled');

    const settings = JSON.parse(readFileSync(path.join(ws, '.pi', 'settings.json'), 'utf8')) as {
      skills?: string[];
    };
    expect(settings.skills).toContain('-skills/beta');
  });

  it('重名技能后项标 shadowed（全局先于项目）', () => {
    mkdirSync(path.join(agentDir, 'skills', 'beta'), { recursive: true });
    writeFileSync(path.join(agentDir, 'skills', 'beta', 'SKILL.md'), SKILL_MD('beta', '全局同名'));

    const views = manager.list(ws);
    const same = views.filter((v) => v.name === 'beta');
    expect(same).toHaveLength(2);
    const project = same.find((v) => v.source === 'project');
    expect(project?.status).toBe('shadowed');
  });

  it('read 返回 SKILL.md 内容（含项目技能）', () => {
    const beta = manager.list(ws).find((v) => v.name === 'beta');
    if (!beta) throw new Error('beta 未发现');
    const r = manager.read(beta.id, ws);
    expect(r?.content).toContain('项目技能');

    const missing = manager.read('workspace:dir:no-such', ws);
    expect(missing).toBeNull();
  });

  it('create 生成合规 SKILL.md 与目录骨架，重名拒绝', () => {
    const created = manager.create({
      name: 'brand-new',
      description: '一个用于测试创建向导的全新技能，描述足够长以便于触发加载判断。',
      template: 'script',
      scope: 'global',
    });
    expect(created.name).toBe('brand-new');
    expect(created.status).toBe('active');
    expect(created.kind).toBe('dir');
    expect(readFileSync(path.join(agentDir, 'skills', 'brand-new', 'SKILL.md'), 'utf8')).toContain(
      'name: brand-new',
    );
    expect(existsSync(path.join(agentDir, 'skills', 'brand-new', 'scripts', 'README.md'))).toBe(
      true,
    );

    expect(() =>
      manager.create({
        name: 'brand-new',
        description: '重复名称应当被拒绝，长度满足要求。',
        scope: 'global',
      }),
    ).toThrow(/已存在/);
  });

  it('create 项目作用域写入 .pi/skills，非法 name 拒绝', () => {
    const created = manager.create({
      name: 'project-skill',
      description: '一个用于测试项目作用域创建的新技能，描述足够长。',
      scope: 'project',
      workspacePath: ws,
    });
    expect(created.source).toBe('project');
    expect(existsSync(path.join(ws, '.pi', 'skills', 'project-skill', 'SKILL.md'))).toBe(true);

    expect(() =>
      manager.create({
        name: 'Bad Name!',
        description: '非法名称应当被拒绝。',
        scope: 'global',
      }),
    ).toThrow(/创建失败/);
  });

  it('update 写回 SKILL.md 并刷新视图', () => {
    const alpha = manager.list(ws).find((v) => v.name === 'alpha');
    if (!alpha) throw new Error('alpha 未发现');
    const updated = manager.update(
      alpha.id,
      '---\nname: alpha\ndescription: 更新后的描述，长度足够。\n---\n新正文',
      ws,
    );
    expect(updated.description).toBe('更新后的描述，长度足够。');
    expect(readFileSync(alpha.path, 'utf8')).toContain('新正文');
  });

  it('validate 返回实时校验诊断', () => {
    const v = manager.validate('---\nname: alpha\ndescription: 短\n---\n', 'beta');
    expect(v.errors).toEqual([]);
    expect(v.infos.length).toBeGreaterThan(0);
  });
});
