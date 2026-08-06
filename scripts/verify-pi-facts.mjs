#!/usr/bin/env node
/**
 * verify:pi-facts —— 内核事实回归（README 14.5 / 16.5 第 4 条）。
 *
 * 对「当前内核」跑 README 第 4 章的事实清单断言：
 *  - pi --version 可执行
 *  - README 4.9 CLI 表面：--help 覆盖关键 flag / 子命令
 *  - README 4.1 Node >= 22.19（monorepo engines 基线）
 * 任一断言 ❌ 即退出码 1；先改 README 再改适配代码（16.5）。
 *
 * 用法：node scripts/verify-pi-facts.mjs
 *       node scripts/verify-pi-facts.mjs --bin <path>
 */
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const BASELINE = '0.83.0'; // README 4 章核实基线（与 fetch-pi-binary.mjs 一致）

// README 4.9 CLI 表面（AgentDesk 会调用的部分）
const EXPECTED_FLAGS = [
  '--print',
  '--mode',
  '--export',
  '--provider',
  '--model',
  '--api-key',
  '--thinking',
  '--list-models',
  '--continue',
  '--resume',
  '--session',
  '--fork',
  '--session-dir',
  '--no-session',
  '--tools',
  '--exclude-tools',
  '--extension',
  '--no-extensions',
  '--skill',
  '--no-skills',
  '--approve',
  '--no-approve',
  '--offline',
];

const EXPECTED_COMMANDS = ['install', 'remove', 'list', 'config', 'update', 'auth'];

const FAILURES = [];
const SKIPS = [];

function check(ok, label, detail = '') {
  if (ok) {
    console.log(`  ✅ ${label}`);
  } else {
    FAILURES.push(label);
    console.log(`  ❌ ${label}${detail ? ` —— ${detail}` : ''}`);
  }
}

function skip(label, detail) {
  SKIPS.push(label);
  console.log(`  ⏭️  ${label} —— ${detail}`);
}

function resolveBinary(cliBin) {
  if (cliBin) return cliBin;
  // 1) 激活内核（~/.agentdesk/kernels/active.json）
  const activeFile = path.join(homedir(), '.agentdesk', 'kernels', 'active.json');
  try {
    if (existsSync(activeFile)) {
      const active = JSON.parse(readFileSync(activeFile, 'utf8'));
      if (typeof active.path === 'string' && existsSync(active.path)) return active.path;
    }
  } catch {
    /* fallthrough */
  }
  // 2) 内置内核 resources/bin/<platform>/pi[.exe]
  const platform = `${process.platform}-${process.arch}`;
  const bin = path.join(
    REPO_ROOT,
    'apps',
    'desktop',
    'resources',
    'bin',
    platform,
    process.platform === 'win32' ? 'pi.exe' : 'pi',
  );
  return existsSync(bin) ? bin : null;
}

function versionSatisfies(actual, required) {
  const a = actual.split('.').map((n) => Number(n) || 0);
  const r = required.split('.').map((n) => Number(n) || 0);
  for (let i = 0; i < Math.max(a.length, r.length); i += 1) {
    const x = a[i] ?? 0;
    const y = r[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return true;
}

async function main() {
  const cliBin = process.argv.includes('--bin')
    ? process.argv[process.argv.indexOf('--bin') + 1]
    : null;
  const binary = resolveBinary(cliBin);

  console.log('── verify:pi-facts（README 第 4 章事实回归）──');
  console.log(`基线：${BASELINE}，Node ${process.versions.node}`);

  check(
    versionSatisfies(process.versions.node, '22.19.0'),
    '4.1 运行时：Node >= 22.19.0',
    `实际 ${process.versions.node}`,
  );

  if (!binary) {
    skip('pi --version', '未找到内核二进制（先运行 pnpm kernel:fetch 或安装内核）');
  } else {
    console.log(`内核：${binary}`);
    let versionOut = '';
    try {
      const { stdout } = await execFileAsync(binary, ['--version'], {
        timeout: 20_000,
        windowsHide: true,
      });
      versionOut = stdout.trim();
      check(true, 'pi --version 可执行', versionOut.split(/\r?\n/)[0] || '(无输出)');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      check(false, 'pi --version 可执行', msg);
    }

    let helpText = '';
    try {
      const { stdout } = await execFileAsync(binary, ['--help'], {
        timeout: 20_000,
        windowsHide: true,
      });
      helpText = stdout;
      check(true, 'pi --help 可执行');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      check(false, 'pi --help 可执行', msg);
    }

    if (helpText) {
      console.log('  4.9 CLI 表面 flag 覆盖：');
      for (const flag of EXPECTED_FLAGS) {
        check(helpText.includes(flag), `  ${flag}`, `--help 输出长度 ${helpText.length}`);
      }
      console.log('  4.9 子命令覆盖：');
      for (const cmd of EXPECTED_COMMANDS) {
        check(
          new RegExp(`\\b${cmd}\\b`).test(helpText),
          `  ${cmd}`,
          `--help 输出长度 ${helpText.length}`,
        );
      }
    }
  }

  const manifest = path.join(REPO_ROOT, 'apps', 'desktop', 'resources', 'bin', 'MANIFEST.json');
  if (existsSync(manifest)) {
    try {
      const m = JSON.parse(readFileSync(manifest, 'utf8'));
      check(typeof m.version === 'string', 'MANIFEST.json version 存在', `version=${m.version}`);
    } catch {
      check(false, 'MANIFEST.json 可解析');
    }
  } else {
    skip('MANIFEST.json', 'resources/bin/MANIFEST.json 未生成');
  }

  console.log('');
  if (FAILURES.length > 0) {
    console.error(
      `❌ 事实回归失败 ${FAILURES.length} 项；按 README 16.5 先改 README 再改适配代码。`,
    );
    process.exit(1);
  }
  if (SKIPS.length > 0) {
    console.log(`⚠️  跳过 ${SKIPS.length} 项（内核未就绪），其余事实通过。`);
    process.exit(0);
  }
  console.log('✅ 全部事实断言通过。');
  process.exit(0);
}

main().catch((err) => {
  console.error(`verify:pi-facts 失败：${err.message}`);
  process.exit(1);
});
