/**
 * KernelManager（README 12.3 / 16.5）：
 * 内核独立升级 —— 版本化目录 ~/.agentdesk/kernels/<version>/，
 * 可与应用版本解耦地单独升级/回退 pi 内核（R1 / 16.5 第 5 条：保留上一版本一个发行周期）。
 *
 * - 内置内核：resources/bin/<platform>/（随应用包分发，MANIFEST.json 记基线版本）。
 * - 可升级内核：下载官方 Release 到 versions/<version>/，SHA256 校验后激活。
 * - 激活记录放 ~/.agentdesk/kernels/active.json（{path, version}）。
 * - 应用启动用 resolveActive() 得到应使用的 pi 二进制路径。
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { chmod, copyFile, mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const API_BASE = 'https://api.github.com/repos/earendil-works/pi';
const ARCHIVE_BY_PLATFORM: Record<string, { asset: string; binary: string }> = {
  'win32-x64': { asset: 'pi-windows-x64.zip', binary: 'pi.exe' },
  'win32-arm64': { asset: 'pi-windows-arm64.zip', binary: 'pi.exe' },
  'darwin-x64': { asset: 'pi-darwin-x64.tar.gz', binary: 'pi' },
  'darwin-arm64': { asset: 'pi-darwin-arm64.tar.gz', binary: 'pi' },
  'linux-x64': { asset: 'pi-linux-x64.tar.gz', binary: 'pi' },
  'linux-arm64': { asset: 'pi-linux-arm64.tar.gz', binary: 'pi' },
};

export interface KernelManagerOptions {
  /** ~/.agentdesk/kernels */
  kernelsDir?: string;
  /** apps/desktop/resources/bin */
  bundledDir?: string;
  /** resources/bin/MANIFEST.json */
  bundledManifest?: string;
}

export interface KernelStatus {
  activeVersion: string | null;
  bundledVersion: string | null;
  installed: string[];
  activePath: string | null;
  latestKnown: string | null;
  canUpdate: boolean;
}

function readJsonFile(file: string): Record<string, unknown> | null {
  const raw = readFileSyncSafe(file);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readFileSyncSafe(file: string): string {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function platformKey(): string {
  return `${process.platform}-${process.arch}`;
}

async function download(url: string, dest: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'agentdesk-kernel-manager' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      await pipeline(
        Readable.fromWeb(res.body as import('node:stream/web').ReadableStream),
        createWriteStream(dest),
      );
      return;
    } catch (err) {
      lastError = err;
      if (attempt >= 3) break;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('download failed');
}

async function sha256Of(file: string): Promise<string> {
  const hash = createHash('sha256');
  const { createReadStream } = await import('node:fs');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
}

async function extractArchive(archive: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  // 全部走系统 tar（Windows 自带 bsdtar，可解 zip；mac/linux 原生 tar 解 gz）
  await execFileAsync('tar', ['-xf', archive, '-C', dest], { windowsHide: true });
}

async function findBinary(dir: string, name: string): Promise<string | null> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === name) return p;
    if (entry.isDirectory()) {
      const found = await findBinary(p, name);
      if (found) return found;
    }
  }
  return null;
}

async function copyTree(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) await copyTree(from, to);
    else if (entry.isFile()) await copyFile(from, to);
  }
}

export class KernelManager {
  private readonly kernelsDir: string;
  private readonly bundledDir: string;
  private readonly bundledManifest: string;
  private readonly activeFile: string;
  private readonly platform: string;

  constructor(options: KernelManagerOptions = {}) {
    this.kernelsDir = options.kernelsDir ?? path.join(homedir(), '.agentdesk', 'kernels');
    this.bundledDir = options.bundledDir ?? '';
    this.bundledManifest = options.bundledManifest ?? '';
    this.activeFile = path.join(this.kernelsDir, 'active.json');
    this.platform = platformKey();
  }

  private activeRecord(): { path: string; version: string | null } | null {
    const parsed = readJsonFile(this.activeFile) as { path?: string; version?: string } | null;
    if (!parsed || typeof parsed.path !== 'string') return null;
    return { path: parsed.path, version: parsed.version ?? null };
  }

  bundledVersion(): string | null {
    if (!this.bundledManifest) return null;
    const manifest = readJsonFile(this.bundledManifest);
    return (manifest?.version as string | undefined) ?? null;
  }

  bundledBinary(): string | null {
    if (!this.bundledDir) return null;
    const binary = path.join(this.bundledDir, this.platform, this.binaryName());
    return existsSync(binary) ? binary : null;
  }

  private binaryName(): string {
    return process.platform === 'win32' ? 'pi.exe' : 'pi';
  }

  private versionsRoot(): string {
    return path.join(this.kernelsDir, 'versions');
  }

  private installedVersions(): string[] {
    const root = this.versionsRoot();
    if (!existsSync(root)) return [];
    return readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  }

  private setActive(p: string, version: string): void {
    mkdirSync(this.kernelsDir, { recursive: true });
    const tmp = `${this.activeFile}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({ path: p, version }, null, 2));
    renameSync(tmp, this.activeFile);
  }
  /** 应用应使用的 pi 二进制：激活的内核 > bundled。 */
  resolveActive(): { path: string | null; version: string | null } {
    const active = this.activeRecord();
    if (active && existsSync(active.path)) {
      return { path: active.path, version: active.version };
    }
    return { path: this.bundledBinary(), version: this.bundledVersion() };
  }

  async status(): Promise<KernelStatus> {
    const active = this.resolveActive();
    const offline = process.env.AGENTDESK_OFFLINE === '1';
    const latestKnown = offline ? null : await this.latestRelease().catch(() => null);
    const bundledVersion = this.bundledVersion();
    const installed = this.installedVersions();
    return {
      activeVersion: active.version,
      bundledVersion,
      installed,
      activePath: active.path,
      latestKnown,
      canUpdate:
        latestKnown !== null && latestKnown !== active.version && latestKnown !== bundledVersion,
    };
  }

  private async latestRelease(): Promise<string | null> {
    const res = await fetch(`${API_BASE}/releases/latest`, {
      headers: { 'User-Agent': 'agentdesk-kernel-manager', Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { tag_name?: string };
    return data.tag_name ? data.tag_name.replace(/^v/, '') : null;
  }

  /** 下载并激活指定版本内核（缺省：最新 release）。 */
  async update(version?: string): Promise<KernelStatus> {
    const target = version ?? (await this.latestRelease());
    if (!target) throw new Error('无法解析目标内核版本');
    const targetDir = path.join(this.versionsRoot(), target);
    if (!existsSync(targetDir)) {
      await this.fetchTo(target, targetDir);
    }
    const binary = await findBinary(targetDir, this.binaryName());
    if (!binary) throw new Error(`内核 ${target} 解压后找不到可执行文件`);
    this.setActive(binary, target);
    return this.status();
  }

  /** 回退到已安装的上一版本（README 16.5 第 5 条：保留上一版本一个发行周期）。 */
  async rollback(): Promise<KernelStatus> {
    const activeVersion = this.resolveActive().version;
    const previous = this.installedVersions()
      .filter((v) => v !== activeVersion && v !== this.bundledVersion())
      .at(-1);
    if (!previous) return this.status();
    const binary = await findBinary(path.join(this.versionsRoot(), previous), this.binaryName());
    if (!binary) return this.status();
    this.setActive(binary, previous);
    return this.status();
  }

  /** 下载、SHA256 校验、解压内核到 versions/<version>/。 */
  private async fetchTo(version: string, destDir: string): Promise<void> {
    const target = ARCHIVE_BY_PLATFORM[this.platform];
    if (!target) throw new Error(`不支持的平台：${this.platform}`);
    const release = await this.getRelease(version);
    const shaAsset = this.findAsset(release, 'SHA256SUMS');
    const archiveAsset = this.findAsset(release, target.asset);

    const tmp = await mkdtemp(path.join(tmpdir(), 'agentdesk-kernel-'));
    try {
      const shaFile = path.join(tmp, 'SHA256SUMS');
      const archiveFile = path.join(tmp, target.asset);
      await download(shaAsset.url, shaFile);
      const sumsText = await readFile(shaFile, 'utf8');
      const expected = this.parseSha256Sum(sumsText, target.asset);
      await download(archiveAsset.url, archiveFile);
      const actual = await sha256Of(archiveFile);
      if (actual !== expected) {
        throw new Error(`SHA256 校验失败：期望 ${expected}，实际 ${actual}`);
      }
      const extractDir = path.join(tmp, 'extract');
      await extractArchive(archiveFile, extractDir);
      const extracted = await findBinary(extractDir, target.binary);
      if (!extracted) throw new Error(`解压产物中找不到 ${target.binary}`);

      const staging = await mkdtemp(path.join(tmpdir(), 'agentdesk-kernel-stage-'));
      await copyTree(extractDir, staging);
      await chmod(path.join(staging, target.binary), 0o755).catch(() => {});
      // 冒烟：--version 能跑才算装好
      await execFileAsync(path.join(staging, target.binary), ['--version'], {
        timeout: 20_000,
        windowsHide: true,
      });
      await copyTree(staging, destDir);
      await rm(staging, { recursive: true, force: true });
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }

  private async getRelease(
    version: string,
  ): Promise<{ tag_name: string; assets: { name: string; url: string }[] }> {
    const url = `${API_BASE}/releases/tags/v${version.replace(/^v/, '')}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'agentdesk-kernel-manager', Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error(`无法获取 release v${version}（HTTP ${res.status}）`);
    return res.json() as Promise<{ tag_name: string; assets: { name: string; url: string }[] }>;
  }

  private findAsset(
    release: { assets: { name: string; url: string }[] },
    name: string,
  ): { name: string; url: string } {
    const asset = release.assets.find((a) => a.name === name);
    if (!asset) throw new Error(`release 缺少资产 ${name}`);
    return asset;
  }

  private parseSha256Sum(text: string, assetName: string): string {
    const line = text.split(/\r?\n/).find((l) => l.trim() && l.trimEnd().endsWith(assetName));
    if (!line) throw new Error(`SHA256SUMS 中没有 ${assetName} 的记录`);
    const hash = line.trim().split(/\s+/)[0];
    if (!hash) throw new Error(`SHA256SUMS 中 ${assetName} 的哈希格式无法解析`);
    return hash.toLowerCase();
  }
}
