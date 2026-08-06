import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readPiSettings, writePiSettings } from '../skills/pi-settings';
import {
  countPackageResources,
  PackageManager,
  parsePackageSource,
  type RunCommandResult,
} from './package-manager';

describe('package-manager（README 8.5.1 / 4.13）', () => {
  let root: string;
  let agentDir: string;
  let workspace: string;
  const calls: Array<{ args: string[]; cwd?: string }> = [];

  const okRunner = async (
    _binary: string,
    args: string[],
    options: { cwd?: string },
  ): Promise<RunCommandResult> => {
    calls.push(options.cwd !== undefined ? { args, cwd: options.cwd } : { args });
    return { code: 0, stdout: `run: ${args.join(' ')}\n`, stderr: '' };
  };

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agentdesk-pkg-'));
    agentDir = path.join(root, 'agent');
    workspace = path.join(root, 'workspace');
    mkdirSync(path.join(agentDir, 'npm'), { recursive: true });
    mkdirSync(path.join(workspace, '.pi'), { recursive: true });
    calls.length = 0;
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const manager = (binary = 'pi'): PackageManager =>
    new PackageManager({ binary, agentDir, runner: okRunner });

  it('parsePackageSource：npm/git/local 身份判定（README 4.13）', () => {
    expect(parsePackageSource('npm:foo@1.2.3').identity).toBe('foo');
    expect(parsePackageSource('foo').sourceType).toBe('npm');
    expect(parsePackageSource('@scope/name@2.0.0').name).toBe('@scope/name');
    expect(parsePackageSource('@scope/name@2.0.0').version).toBe('2.0.0');
    const git = parsePackageSource('git:https://github.com/a/b.git#v1');
    expect(git.sourceType).toBe('git');
    expect(git.identity).toBe('https://github.com/a/b.git');
    expect(git.ref).toBe('v1');
    const local = parsePackageSource('local:C:/tmp/my-pkg', agentDir);
    expect(local.sourceType).toBe('local');
    expect(local.identity).toBe('C:/tmp/my-pkg');
    const piRelative = parsePackageSource('..\\pkg', agentDir);
    expect(piRelative.sourceType).toBe('local');
    expect(piRelative.identity).toBe(path.join(agentDir, '..', 'pkg').split('\\').join('/'));
  });

  it('countPackageResources 按约定目录统计（README 4.13）', () => {
    const pkg = path.join(root, 'installed');
    mkdirSync(path.join(pkg, 'extensions'), { recursive: true });
    mkdirSync(path.join(pkg, 'skills', 's1'), { recursive: true });
    mkdirSync(path.join(pkg, 'prompts'), { recursive: true });
    mkdirSync(path.join(pkg, 'themes'), { recursive: true });
    writeFileSync(path.join(pkg, 'extensions', 'a.ts'), '');
    writeFileSync(path.join(pkg, 'extensions', 'b.js'), '');
    writeFileSync(path.join(pkg, 'extensions', 'readme.txt'), '');
    writeFileSync(path.join(pkg, 'skills', 's1', 'SKILL.md'), '');
    writeFileSync(path.join(pkg, 'skills', 's2.md'), '');
    writeFileSync(path.join(pkg, 'prompts', 'p.md'), '');
    writeFileSync(path.join(pkg, 'themes', 't.json'), '');
    expect(countPackageResources(pkg)).toEqual({
      extensions: 2,
      skills: 1,
      prompts: 1,
      themes: 1,
    });
  });

  it('list：合并全局 + 项目，冲突标注 project-overrides / overridden-by-project', async () => {
    writePiSettings(path.join(agentDir, 'settings.json'), {
      packages: ['npm:foo'],
      theme: 'dark',
    });
    writePiSettings(path.join(workspace, '.pi', 'settings.json'), {
      packages: ['npm:foo', 'npm:bar'],
    });
    const views = await manager().list(workspace);
    const fooGlobal = views.find((v) => v.id === 'global:foo');
    const fooProject = views.find((v) => v.id === 'project:foo');
    expect(fooGlobal?.conflict).toBe('overridden-by-project');
    expect(fooProject?.conflict).toBe('project-overrides');
    expect(fooProject?.scope).toBe('project');
    expect(views.some((v) => v.id === 'project:bar')).toBe(true);
  });

  it('list：项目条目 autoload:false → delta-overlay', async () => {
    writePiSettings(path.join(agentDir, 'settings.json'), {
      packages: ['npm:foo'],
    });
    writePiSettings(path.join(workspace, '.pi', 'settings.json'), {
      packages: [{ source: 'npm:foo', autoload: false }],
    });
    const views = await manager().list(workspace);
    expect(views.find((v) => v.id === 'project:foo')?.conflict).toBe('delta-overlay');
  });

  it('list：npm 安装路径与资源数（磁盘探测），pi list 输出补 installed', async () => {
    const pkgDir = path.join(agentDir, 'npm', 'foo');
    mkdirSync(path.join(pkgDir, 'extensions'), { recursive: true });
    writeFileSync(path.join(pkgDir, 'extensions', 'x.ts'), '');
    writePiSettings(path.join(agentDir, 'settings.json'), { packages: ['npm:foo'] });
    const views = await manager().list();
    const foo = views.find((v) => v.id === 'global:foo');
    expect(foo?.installed).toBe(true);
    expect(foo?.installPath).toBe(pkgDir);
    expect(foo?.resources.extensions).toBe(1);
  });

  it('install：npm 全局调 pi install npm:foo，写 settings.packages[]', async () => {
    const res = await manager().install({ source: { type: 'npm', name: 'foo' }, scope: 'global' });
    expect(res.ok).toBe(true);
    expect(calls[0]?.args).toEqual(['install', 'npm:foo']);
    const settings = readPiSettings(path.join(agentDir, 'settings.json'));
    expect(settings.packages).toEqual(['npm:foo']);
  });

  it('install：本地源传绝对路径给 pi（不带 local: 前缀），settings 写 local:<abs>', async () => {
    const pkgDir = path.join(root, 'local-pkg');
    mkdirSync(pkgDir, { recursive: true });
    const res = await manager().install({
      source: { type: 'local', path: pkgDir },
      scope: 'global',
    });
    expect(res.ok).toBe(true);
    expect(calls[0]?.args).toEqual(['install', path.resolve(pkgDir)]);
    expect(readPiSettings(path.join(agentDir, 'settings.json')).packages).toEqual([
      `local:${pkgDir}`,
    ]);
  });

  it('install：项目作用域加 -l 并写项目 settings；已存在条目不重复', async () => {
    const m = manager();
    await m.install({
      source: { type: 'npm', name: 'foo' },
      scope: 'project',
      workspacePath: workspace,
    });
    expect(calls[0]?.args).toEqual(['install', 'npm:foo', '-l']);
    expect(readPiSettings(path.join(workspace, '.pi', 'settings.json')).packages).toEqual([
      'npm:foo',
    ]);
    await m.install({
      source: { type: 'npm', name: 'foo' },
      scope: 'project',
      workspacePath: workspace,
    });
    expect(readPiSettings(path.join(workspace, '.pi', 'settings.json')).packages).toEqual([
      'npm:foo',
    ]);
  });

  it('install：git URL 带 ref 的 spec 与安装路径', async () => {
    await manager().install({
      source: { type: 'git', url: 'https://github.com/a/b.git', ref: 'v2' },
      scope: 'global',
    });
    expect(calls[0]?.args).toEqual(['install', 'git:https://github.com/a/b.git#v2']);
    expect(readPiSettings(path.join(agentDir, 'settings.json')).packages).toEqual([
      'git:https://github.com/a/b.git#v2',
    ]);
  });

  it('install：失败时 ok=false、不写 settings、返回 stderr 日志', async () => {
    const m = new PackageManager({
      binary: 'pi',
      agentDir,
      runner: async () => ({ code: 1, stdout: '', stderr: 'npm ERR! failed' }),
    });
    const res = await m.install({ source: { type: 'npm', name: 'foo' }, scope: 'global' });
    expect(res.ok).toBe(false);
    expect(res.log).toContain('npm ERR! failed');
    expect(readPiSettings(path.join(agentDir, 'settings.json')).packages).toBeUndefined();
  });

  it('uninstall：成功后移除 settings 条目；对象形式条目也按 identity 移除', async () => {
    writePiSettings(path.join(agentDir, 'settings.json'), {
      packages: ['npm:foo', { source: 'npm:bar', extensions: [] }],
    });
    const m = manager();
    const res = await m.uninstall({ source: 'npm:foo', scope: 'global' });
    expect(res.ok).toBe(true);
    expect(calls[0]?.args).toEqual(['remove', 'npm:foo']);
    expect(readPiSettings(path.join(agentDir, 'settings.json')).packages).toEqual([
      { source: 'npm:bar', extensions: [] },
    ]);
  });

  it('uninstall：本地源不调 pi remove，直接从 settings 移除并返回 note', async () => {
    const pkgDir = path.join(root, 'local-pkg');
    mkdirSync(pkgDir, { recursive: true });
    const m = manager();
    writePiSettings(path.join(agentDir, 'settings.json'), { packages: [`local:${pkgDir}`] });
    const before = calls.length;
    const res = await m.uninstall({ source: `local:${pkgDir}`, scope: 'global' });
    expect(res.ok).toBe(true);
    expect(res.command).toContain('settings.packages');
    expect(calls.length).toBe(before);
    expect(readPiSettings(path.join(agentDir, 'settings.json')).packages).toEqual([]);
  });

  it('update：单包与 --extensions 批量；npm 带版本 spec 附说明', async () => {
    const m = manager();
    await m.update({ source: 'npm:foo', scope: 'global' });
    expect(calls[0]?.args).toEqual(['update', 'npm:foo']);
    const versioned = await m.update({ source: 'npm:foo@1.2.3', scope: 'global' });
    expect(versioned.note).toContain('跳过');
    await m.update({ extensions: true, scope: 'global' });
    expect(calls[2]?.args).toEqual(['update', '--extensions']);
  });

  it('setFilter：写对象形式过滤，[]=停用，undefined=恢复全量，保留其他 settings 字段', async () => {
    writePiSettings(path.join(agentDir, 'settings.json'), {
      packages: ['npm:foo'],
      theme: 'dark',
    });
    const m = manager();
    await m.setFilter({
      source: 'npm:foo',
      scope: 'global',
      filter: { extensions: [], skills: ['+skills/a'] },
    });
    expect(readPiSettings(path.join(agentDir, 'settings.json'))).toEqual({
      packages: [{ source: 'npm:foo', extensions: [], skills: ['+skills/a'] }],
      theme: 'dark',
    });
    const view = await m.setFilter({
      source: 'npm:foo',
      scope: 'global',
      filter: { autoload: false },
    });
    expect(view.autoload).toBe(false);
    const stored = readPiSettings(path.join(agentDir, 'settings.json')).packages as unknown[];
    expect(stored[0]).toEqual({ source: 'npm:foo', autoload: false });
  });

  it('无二进制时安装/卸载/更新抛清晰错误，列表仍可用', async () => {
    const m = new PackageManager({ agentDir, runner: okRunner });
    await expect(
      m.install({ source: { type: 'npm', name: 'foo' }, scope: 'global' }),
    ).rejects.toThrow('未找到 pi 内核二进制');
    await expect(m.update({ source: 'npm:foo', scope: 'global' })).rejects.toThrow(
      '未找到 pi 内核二进制',
    );
    await expect(m.uninstall({ source: 'npm:foo', scope: 'global' })).rejects.toThrow(
      '未找到 pi 内核二进制',
    );
    expect(await m.list()).toEqual([]);
  });
});
