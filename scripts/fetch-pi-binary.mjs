#!/usr/bin/env node
import { execFile } from 'node:child_process';
/**
 * 下载并校验 pi standalone 二进制（README M0 / 14.5）。
 *
 * 流程：查 GitHub Release 资产 → 下载 SHA256SUMS 与归档 → 校验 SHA256 →
 * 解压出 pi[.exe] → 放到 apps/desktop/resources/bin/<platform>/ → 写 MANIFEST.json。
 *
 * 用法：
 *   node scripts/fetch-pi-binary.mjs                       # 当前平台，默认 v0.83.0
 *   node scripts/fetch-pi-binary.mjs --version latest       # 最新 release
 *   node scripts/fetch-pi-binary.mjs --platform linux-x64   # 跨平台拉取（CI 用）
 *   node scripts/fetch-pi-binary.mjs --out <dir>
 */
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { chmod, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUT = path.join(REPO_ROOT, 'apps', 'desktop', 'resources', 'bin');
const DEFAULT_VERSION = '0.83.0'; // README 4 章核实基线
const API_BASE = 'https://api.github.com/repos/earendil-works/pi';

const ARCHIVE_BY_PLATFORM = {
  'win32-x64': { asset: 'pi-windows-x64.zip', binary: 'pi.exe' },
  'win32-arm64': { asset: 'pi-windows-arm64.zip', binary: 'pi.exe' },
  'darwin-x64': { asset: 'pi-darwin-x64.tar.gz', binary: 'pi' },
  'darwin-arm64': { asset: 'pi-darwin-arm64.tar.gz', binary: 'pi' },
  'linux-x64': { asset: 'pi-linux-x64.tar.gz', binary: 'pi' },
  'linux-arm64': { asset: 'pi-linux-arm64.tar.gz', binary: 'pi' },
};

function parseArgs(argv) {
  const args = {
    version: DEFAULT_VERSION,
    out: DEFAULT_OUT,
    platform: `${process.platform}-${process.arch}`,
    mirror: process.env.PI_DOWNLOAD_MIRROR ?? '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--version') args.version = argv[++i];
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--platform') args.platform = argv[++i];
    else if (arg === '--mirror') args.mirror = argv[++i];
    else if (arg === '--help') {
      console.log(
        '用法：node scripts/fetch-pi-binary.mjs [--version <v|latest>] [--platform <win32-x64|darwin-arm64|...>] [--mirror <url>] [--out <dir>]',
      );
      process.exit(0);
    }
  }
  return args;
}

async function download(url, dest, headers = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(url, { headers, redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
      await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
      return;
    } catch (err) {
      lastError = err;
      console.warn(`下载失败（第 ${attempt} 次）：${err.message}`);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw lastError;
}

async function getReleaseInfo(version) {
  const url =
    version === 'latest'
      ? `${API_BASE}/releases/latest`
      : `${API_BASE}/releases/tags/v${version.replace(/^v/, '')}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'agentdesk-kernel-fetch' } });
  if (!res.ok) throw new Error(`无法获取 release 信息：HTTP ${res.status} for ${url}`);
  return res.json();
}

function findAsset(release, name) {
  const asset = release.assets.find((a) => a.name === name);
  if (!asset) {
    throw new Error(`release ${release.tag_name} 缺少资产 ${name}`);
  }
  return asset;
}

async function sha256Of(file) {
  const hash = createHash('sha256');
  const { createReadStream } = await import('node:fs');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
}

async function parseSha256Sums(text, assetName) {
  const line = text.split(/\r?\n/).find((l) => l.trim() && l.trimEnd().endsWith(assetName));
  if (!line) throw new Error(`SHA256SUMS 中没有 ${assetName} 的记录`);
  const hash = line.trim().split(/\s+/)[0];
  if (!hash) throw new Error(`SHA256SUMS 中 ${assetName} 的哈希格式无法解析`);
  return hash.toLowerCase();
}

async function extractArchive(archive, dest) {
  await mkdir(dest, { recursive: true });
  const isWindows = process.platform === 'win32';
  if (archive.endsWith('.zip')) {
    // Windows 系统自带 bsdtar，可解 zip；mac/linux 不用 zip
    await execFileAsync(isWindows ? 'tar' : 'unzip', ['-xf', archive, '-C', dest], {
      windowsHide: true,
    });
  } else {
    await execFileAsync('tar', ['-xzf', archive, '-C', dest], { windowsHide: true });
  }
}


async function copyDir(src, dest) {
  const { copyFile } = await import('node:fs/promises');
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) await copyDir(from, to);
    else if (entry.isFile()) await copyFile(from, to);
  }
}
async function findBinary(dir, name) {
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = ARCHIVE_BY_PLATFORM[args.platform];
  if (!target) {
    throw new Error(
      `不支持的平台：${args.platform}（可选：${Object.keys(ARCHIVE_BY_PLATFORM).join(', ')}）`,
    );
  }

  const release = await getReleaseInfo(args.version);
  const tag = release.tag_name;
  const shaAsset = findAsset(release, 'SHA256SUMS');
  const archiveAsset = findAsset(release, target.asset);

  const tmpDir = await mkdir(path.join(tmpdir(), `agentdesk-kernel-${Date.now()}`), {
    recursive: true,
  });
  const shaFile = path.join(tmpDir, 'SHA256SUMS');
  const archiveFile = path.join(tmpDir, target.asset);
  const extractDir = path.join(tmpDir, 'extract');
  const downloadHeaders = {
    'User-Agent': 'agentdesk-kernel-fetch',
    Accept: 'application/octet-stream',
  };

  try {
    console.log(`下载 SHA256SUMS（${tag}）…`);
    await download(shaAsset.url, shaFile, downloadHeaders);
    const sumsText = await import('node:fs/promises').then((m) => m.readFile(shaFile, 'utf8'));
    const expected = await parseSha256Sums(sumsText, target.asset);

    console.log(`下载 ${target.asset}（${tag}）…`);
    if (args.mirror) {
      // 直连 GitHub 受限时走镜像（如 https://gh-proxy.com/ 前缀），官方源仍为默认
      await download(
        `${args.mirror.replace(/\/$/, '')}/${archiveAsset.browser_download_url}`,
        archiveFile,
        {
          'User-Agent': 'agentdesk-kernel-fetch',
        },
      );
    } else {
      await download(archiveAsset.url, archiveFile, downloadHeaders);
    }

    const actual = await sha256Of(archiveFile);
    if (actual !== expected) {
      throw new Error(`SHA256 校验失败：期望 ${expected}，实际 ${actual}`);
    }
    console.log(`SHA256 校验通过：${actual}`);

    console.log('解压…');
    await extractArchive(archiveFile, extractDir);
    const binary = await findBinary(extractDir, target.binary);
    if (!binary) throw new Error(`解压产物中找不到 ${target.binary}`);

    const outDir = path.join(args.out, args.platform);
    // 完整复制解压产物：pi.exe 依赖同目录 theme/ 与 native/（README 4.1 事实）
    await copyDir(extractDir, outDir);
    const destBinary = path.join(outDir, target.binary);
    if (process.platform !== 'win32') await chmod(destBinary, 0o755);
    const binStat = await stat(destBinary);

    const manifest = {
      repo: 'earendil-works/pi',
      tag,
      version: tag.replace(/^v/, ''),
      platform: args.platform,
      asset: target.asset,
      sha256: actual,
      binary: `${args.platform}/${target.binary}`,
      sizeBytes: binStat.size,
      downloadedAt: new Date().toISOString(),
      url: archiveAsset.browser_download_url,
    };
    await writeFile(path.join(args.out, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);

    console.log(`已安装：${destBinary}（${Math.round(binStat.size / 1024 / 1024)} MB）`);
    console.log(`MANIFEST：${path.join(args.out, 'MANIFEST.json')}`);

    // G0 门禁：pi --version 必须能跑
    const { stdout, stderr } = await execFileAsync(destBinary, ['--version'], {
      timeout: 20_000,
      windowsHide: true,
    });
    console.log(`pi --version => ${stdout.trim() || stderr.trim()}`);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(`kernel:fetch 失败：${err.message}`);
  process.exit(1);
});
