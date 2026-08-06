import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PackageSecurityInspector, type RunCommandResult } from './package-security';

describe('package-security（README 8.5.1 安全审查）', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agentdesk-sec-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const npmRunner =
    (viewJson: string, packJson: string) =>
    async (
      binary: string,
      args: string[],
      _options: { cwd?: string; timeoutMs?: number },
    ): Promise<RunCommandResult> => {
      if (args[0] === 'view') {
        return { code: 0, stdout: viewJson, stderr: '' };
      }
      if (args[0] === 'pack') {
        return { code: 0, stdout: packJson, stderr: '' };
      }
      throw new Error(`unexpected npm args: ${args.join(' ')} (binary=${binary})`);
    };

  it('npm：解析 view（依赖/脚本/许可证）+ pack 文件清单，postinstall 给出警告', async () => {
    const inspector = new PackageSecurityInspector({
      runner: npmRunner(
        JSON.stringify({
          name: 'demo-pkg',
          version: '1.2.3',
          description: 'demo',
          license: 'MIT',
          dependencies: { lodash: '^4.17.21' },
          scripts: { postinstall: 'node scripts/install.js' },
        }),
        JSON.stringify({
          files: [
            { path: 'package.json', size: 100 },
            { path: 'index.js', size: 200 },
            { path: 'scripts/install.js', size: 50 },
          ],
        }),
      ),
    });
    const inspection = await inspector.inspect({
      type: 'npm',
      name: 'demo-pkg',
      version: '1.2.3',
    });
    expect(inspection.sourceType).toBe('npm');
    expect(inspection.name).toBe('demo-pkg');
    expect(inspection.version).toBe('1.2.3');
    expect(inspection.fileCount).toBe(3);
    expect(inspection.files).toContain('index.js');
    expect(inspection.hasPostinstall).toBe(true);
    expect(inspection.installScripts.postinstall).toContain('install.js');
    expect(inspection.dependencies).toEqual({ lodash: '^4.17.21' });
    expect(inspection.license).toBe('MIT');
    expect(inspection.warnings.some((w) => w.includes('postinstall'))).toBe(true);
  });

  it('npm：view 失败时抛清晰错误', async () => {
    const inspector = new PackageSecurityInspector({
      runner: async () => ({ code: 1, stdout: '', stderr: 'npm ERR! 404 Not Found' }),
    });
    await expect(inspector.inspect({ type: 'npm', name: 'not-exist-pkg' })).rejects.toThrow(
      'npm view not-exist-pkg 失败',
    );
  });

  it('git：mock clone 后扫描文件清单与 package.json', async () => {
    const fixture = path.join(root, 'repo');
    mkdirSync(path.join(fixture, 'extensions'), { recursive: true });
    mkdirSync(path.join(fixture, 'skills', 's1'), { recursive: true });
    writeFileSync(
      path.join(fixture, 'package.json'),
      JSON.stringify({
        name: 'repo-pkg',
        scripts: { postinstall: 'echo hi' },
      }),
    );
    writeFileSync(path.join(fixture, 'extensions', 'a.ts'), '');
    writeFileSync(path.join(fixture, 'skills', 's1', 'SKILL.md'), '');
    writeFileSync(path.join(fixture, 'README.md'), '');
    const inspector = new PackageSecurityInspector({
      runner: async (binary, args) => {
        expect(binary).toBe('git');
        expect(args.slice(0, 3)).toEqual(['clone', '--depth', '1']);
        const target = args[args.length - 1];
        if (!target) throw new Error('no clone target');
        for (const name of readdirSync(fixture)) {
          cpSync(path.join(fixture, name), path.join(target, name), { recursive: true });
        }
        return { code: 0, stdout: '', stderr: '' };
      },
    });
    const inspection = await inspector.inspect({
      type: 'git',
      url: 'https://github.com/a/repo.git',
      ref: 'v1',
    });
    expect(inspection.sourceType).toBe('git');
    expect(inspection.name).toBe('repo-pkg');
    expect(inspection.fileCount).toBe(4);
    expect(inspection.files).toContain('extensions/a.ts');
    expect(inspection.files).toContain('skills/s1/SKILL.md');
    expect(inspection.hasPostinstall).toBe(true);
  });

  it('local：直接扫描；缺 package.json 时给出警告', async () => {
    const dir = path.join(root, 'pkg');
    mkdirSync(path.join(dir, 'themes'), { recursive: true });
    writeFileSync(path.join(dir, 'themes', 'dark.json'), '{}');
    const inspector = new PackageSecurityInspector();
    const inspection = await inspector.inspect({ type: 'local', path: dir });
    expect(inspection.sourceType).toBe('local');
    expect(inspection.fileCount).toBe(1);
    expect(inspection.warnings.some((w) => w.includes('package.json'))).toBe(true);
  });

  it('local：目录不存在时抛清晰错误', async () => {
    const inspector = new PackageSecurityInspector();
    await expect(
      inspector.inspect({ type: 'local', path: path.join(root, 'missing') }),
    ).rejects.toThrow('本地目录不存在');
  });
});
