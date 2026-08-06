/**
 * Diff 引擎（README 8.9 / M8 第二步）：
 * - 结构化 hunk（行级增删 + 每块独立 patch）与 unified 文本
 * - 逐块接受 / 回滚：applyPatch 正向应用，reversePatch 反向写回，原子写文件
 * - git 工作区 diff：working tree vs HEAD（git show HEAD:<rel>），未跟踪文件基线为空
 * - 每次接受/回滚记入 file_audit（README：回滚 = 反向 patch 写回，记入审计）
 */
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { applyPatch, createTwoFilesPatch, parsePatch, reversePatch, structuredPatch } from 'diff';
import type { FileAuditStore } from '../storage/file-audit-store';

const execFileAsync = promisify(execFile);

export type DiffLinePrefix = ' ' | '+' | '-';
export type DiffDirection = 'accept' | 'revert';

export interface DiffHunkLine {
  prefix: DiffLinePrefix;
  text: string;
}

export interface DiffHunk {
  id: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffHunkLine[];
  /** 单块 unified patch（@@ 头 + 行），可直接喂 applyPatch。 */
  patch: string;
}

export interface TextDiffResult {
  fileName: string;
  original: string;
  modified: string;
  hunks: DiffHunk[];
  unified: string;
}

export interface FileDiffResult extends TextDiffResult {
  tracked: boolean;
  gitAvailable: boolean;
}

function hunkPatchOf(hunk: {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}): string {
  const header = `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`;
  return `${[header, ...hunk.lines].join('\n')}\n`;
}

/** 两个文本的逐块 diff（纯计算，不落盘）。 */
export function computeDiff(fileName: string, original: string, modified: string): TextDiffResult {
  const patch = structuredPatch(fileName, fileName, original, modified, '', '');
  const hunks: DiffHunk[] = patch.hunks.map((hunk, index) => ({
    id: `h${index + 1}`,
    oldStart: hunk.oldStart,
    oldLines: hunk.oldLines,
    newStart: hunk.newStart,
    newLines: hunk.newLines,
    lines: hunk.lines.map((line) => {
      const prefix = line.startsWith('+')
        ? ('+' as const)
        : line.startsWith('-')
          ? ('-' as const)
          : (' ' as const);
      return { prefix, text: line.slice(1) };
    }),
    patch: hunkPatchOf(hunk),
  }));
  return {
    fileName,
    original,
    modified,
    hunks,
    unified: createTwoFilesPatch(fileName, fileName, original, modified),
  };
}

function readFileSafe(file: string): string | null {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function atomicWrite(file: string, content: string): void {
  const tmp = `${file}.${process.pid}.diff.tmp`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, file);
}

type ParsedHunkPatch = ReturnType<typeof parsePatch>[number];

function parseSingleHunk(patchText: string): ParsedHunkPatch | null {
  try {
    const parsed = parsePatch(patchText);
    const first = parsed[0];
    if (!first || first.hunks.length === 0) return null;
    return { ...first, hunks: first.hunks.slice(0, 1) };
  } catch {
    return null;
  }
}

/** 应用单个 hunk：accept=正向（original→modified），revert=反向（modified→original），写回 + 审计。 */
export function applyHunk(
  options: { file: string; patch: string; direction: DiffDirection; workspacePath?: string },
  audit?: FileAuditStore,
): { ok: boolean; message: string } {
  if (!existsSync(options.file)) return { ok: false, message: '文件不存在' };
  const current = readFileSafe(options.file);
  if (current === null) return { ok: false, message: '文件不可读' };
  const parsed = parseSingleHunk(options.patch);
  if (!parsed) return { ok: false, message: '无效的 diff 块' };
  const target = options.direction === 'revert' ? reversePatch(parsed) : parsed;
  let applied: string | false;
  try {
    applied = applyPatch(current, target, { fuzzFactor: 0 });
  } catch {
    applied = false;
  }
  if (applied === false) {
    return { ok: false, message: '文件内容已变化，无法应用此块（请刷新后重试）' };
  }
  atomicWrite(options.file, applied);
  audit?.record({
    path: options.file,
    ...(options.workspacePath !== undefined ? { workspacePath: options.workspacePath } : {}),
    action: options.direction,
    patchJson: options.patch,
  });
  return {
    ok: true,
    message: options.direction === 'accept' ? '已接受此更改' : '已撤销此更改（反向 patch 写回）',
  };
}

async function runGit(
  args: string[],
  cwd: string,
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd,
      windowsHide: true,
      timeout: 15_000,
      maxBuffer: 30 * 1024 * 1024,
    });
    return { ok: true, stdout: stdout ?? '', stderr: stderr ?? '' };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, stdout: e.stdout ?? '', stderr: e.stderr ?? e.message ?? String(err) };
  }
}

/** git 工作区 diff：working tree vs HEAD；文件须在 root 内（防越界）。 */
export async function diffGitFile(root: string, file: string): Promise<FileDiffResult> {
  const abs = path.isAbsolute(file) ? path.resolve(file) : path.resolve(root, file);
  const rel = path.relative(root, abs).split('\\').join('/');
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('文件不在工作区内');
  }
  const gitAvailable = (await runGit(['rev-parse', '--is-inside-work-tree'], root)).ok;
  let original = '';
  let tracked = false;
  if (gitAvailable) {
    const show = await runGit(['show', `HEAD:${rel}`], root);
    if (show.ok) {
      original = show.stdout;
      tracked = true;
    }
  }
  const modified = readFileSafe(abs);
  if (modified === null) throw new Error('文件不存在或不可读');
  return {
    ...computeDiff(path.basename(abs), original, modified),
    tracked,
    gitAvailable,
  };
}

export class DiffEngine {
  private readonly audit: FileAuditStore | null;

  constructor(audit?: FileAuditStore) {
    this.audit = audit ?? null;
  }

  compute(req: { fileName: string; original: string; modified: string }): TextDiffResult {
    return computeDiff(req.fileName, req.original, req.modified);
  }

  file(req: { root: string; file: string }): Promise<FileDiffResult> {
    return diffGitFile(req.root, req.file);
  }

  applyHunk(req: {
    file: string;
    patch: string;
    direction: DiffDirection;
    workspacePath?: string;
  }): { ok: boolean; message: string } {
    return applyHunk(req, this.audit ?? undefined);
  }
}
