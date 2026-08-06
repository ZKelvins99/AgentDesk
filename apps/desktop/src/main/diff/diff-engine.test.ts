import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDatabase } from '../storage/db';
import { FileAuditStore } from '../storage/file-audit-store';
import { applyHunk, computeDiff, diffGitFile } from './diff-engine';

function gitAvailable(): boolean {
  try {
    execFileSync('git', ['--version'], { windowsHide: true, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

describe('computeDiff（结构化 hunk + unified）', () => {
  it('行级增删 hunk 与 unified 文本', () => {
    const res = computeDiff('a.txt', 'line1\nline2\nline3\n', 'line1\nline2!\nline3\n');
    expect(res.fileName).toBe('a.txt');
    expect(res.hunks.length).toBeGreaterThan(0);
    const hunk = res.hunks[0];
    if (!hunk) throw new Error('缺少 hunk');
    expect(hunk.patch).toContain('@@');
    expect(hunk.lines.some((l) => l.prefix === '-')).toBe(true);
    expect(hunk.lines.some((l) => l.prefix === '+')).toBe(true);
    expect(res.unified).toContain('-line2');
    expect(res.unified).toContain('+line2!');
  });

  it('无差异返回空 hunks', () => {
    const res = computeDiff('a.txt', 'same\n', 'same\n');
    expect(res.hunks).toEqual([]);
  });
});

describe('applyHunk（逐块接受/回滚 + 审计）', () => {
  it('accept 正向写回为 modified，revert 反向恢复 original', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'agentdesk-diff-'));
    const file = path.join(root, 'a.txt');
    const original = 'a\nb\nc\n';
    const modified = 'a\nb2\nc\n';
    writeFileSync(file, original);
    const hunk = computeDiff('a.txt', original, modified).hunks[0];
    if (!hunk) throw new Error('缺少 hunk');

    const accepted = applyHunk({ file, patch: hunk.patch, direction: 'accept' });
    expect(accepted.ok).toBe(true);
    expect(readFileSync(file, 'utf8')).toBe(modified);

    const reverted = applyHunk({ file, patch: hunk.patch, direction: 'revert' });
    expect(reverted.ok).toBe(true);
    expect(readFileSync(file, 'utf8')).toBe(original);
    rmSync(root, { recursive: true, force: true });
  });

  it('文件已变化时拒绝应用（stale patch）', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'agentdesk-diff-'));
    const file = path.join(root, 'a.txt');
    writeFileSync(file, 'a\nb\nc\n');
    const hunk = computeDiff('a.txt', 'a\nb\nc\n', 'a\nb2\nc\n').hunks[0];
    if (!hunk) throw new Error('缺少 hunk');
    writeFileSync(file, 'zzz\n');
    const res = applyHunk({ file, patch: hunk.patch, direction: 'accept' });
    expect(res.ok).toBe(false);
    expect(res.message).toContain('已变化');
    rmSync(root, { recursive: true, force: true });
  });

  it('接受/回滚记入 file_audit', () => {
    const db = openDatabase(':memory:');
    const audit = new FileAuditStore(db);
    const root = mkdtempSync(path.join(tmpdir(), 'agentdesk-diff-'));
    const file = path.join(root, 'a.txt');
    const original = 'x\n';
    const modified = 'y\n';
    writeFileSync(file, original);
    const hunk = computeDiff('a.txt', original, modified).hunks[0];
    if (!hunk) throw new Error('缺少 hunk');
    applyHunk({ file, patch: hunk.patch, direction: 'accept', workspacePath: root }, audit);
    const entries = audit.list();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.action).toBe('accept');
    expect(entries[0]?.workspacePath).toBe(root);
    expect(entries[0]?.patchJson).toContain('@@');
    db.close();
    rmSync(root, { recursive: true, force: true });
  });
});

describe.skipIf(!gitAvailable())('diffGitFile（真实 git 仓库）', () => {
  it('tracked 文件：HEAD 基线 + 工作区改动；untracked：基线为空', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'agentdesk-gitdiff-'));
    execFileSync('git', ['init', '-q'], { cwd: root, windowsHide: true, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], {
      cwd: root,
      windowsHide: true,
      stdio: 'ignore',
    });
    execFileSync('git', ['config', 'user.name', 'test'], {
      cwd: root,
      windowsHide: true,
      stdio: 'ignore',
    });
    writeFileSync(path.join(root, 'a.txt'), 'v1\n');
    execFileSync('git', ['add', 'a.txt'], { cwd: root, windowsHide: true, stdio: 'ignore' });
    execFileSync('git', ['commit', '-q', '-m', 'init'], {
      cwd: root,
      windowsHide: true,
      stdio: 'ignore',
    });
    writeFileSync(path.join(root, 'a.txt'), 'v2\n');
    writeFileSync(path.join(root, 'new.txt'), 'new\n');

    const tracked = await diffGitFile(root, 'a.txt');
    expect(tracked.tracked).toBe(true);
    expect(tracked.gitAvailable).toBe(true);
    expect(tracked.original).toBe('v1\n');
    expect(tracked.modified).toBe('v2\n');
    expect(tracked.hunks.length).toBeGreaterThan(0);

    const untracked = await diffGitFile(root, 'new.txt');
    expect(untracked.tracked).toBe(false);
    expect(untracked.original).toBe('');
    expect(untracked.modified).toBe('new\n');
    rmSync(root, { recursive: true, force: true });
  });
});
