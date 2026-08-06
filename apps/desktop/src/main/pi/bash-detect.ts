import { execFile } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface BashProbe {
  path: string | null;
  source: 'settings' | 'git-bash' | 'path' | 'none';
  version: string | null;
  note?: string;
}

/**
 * Windows bash 探测（README 4.1）：
 * settings.shellPath → C:\Program Files\Git\bin\bash.exe → PATH 上的 bash.exe。
 * WSL 启动器（C:\Windows\System32\bash.exe）不算可用 bash。
 */
export async function detectBash(options: { settingsShellPath?: string } = {}): Promise<BashProbe> {
  if (process.platform !== 'win32') {
    return { path: 'bash', source: 'path', version: null };
  }

  const candidates: Array<{ path: string; source: BashProbe['source'] }> = [];
  if (options.settingsShellPath) {
    candidates.push({ path: options.settingsShellPath, source: 'settings' });
  }
  candidates.push({ path: 'C:\\Program Files\\Git\\bin\\bash.exe', source: 'git-bash' });
  for (const dir of (process.env.PATH ?? '').split(';')) {
    if (!dir) continue;
    const p = path.join(dir, 'bash.exe');
    if (p.toLowerCase() !== 'C:\\Program Files\\Git\\bin\\bash.exe'.toLowerCase()) {
      candidates.push({ path: p, source: 'path' });
    }
  }

  let wslLauncherSeen = false;
  for (const candidate of candidates) {
    try {
      await access(candidate.path, constants.X_OK);
      const { stdout, stderr } = await execFileAsync(candidate.path, ['--version'], {
        timeout: 5000,
        windowsHide: true,
      });
      const version = (stdout || stderr).split(/\r?\n/)[0] ?? null;
      if (version && /wsl/i.test(version)) {
        wslLauncherSeen = true;
        continue;
      }
      return { path: candidate.path, source: candidate.source, version };
    } catch {
      // 不可执行或 WSL 未安装发行版，继续探测下一个
    }
  }

  return {
    path: null,
    source: 'none',
    version: null,
    note: wslLauncherSeen ? 'PATH 上的 bash 是 WSL 启动器（未安装发行版）' : '未找到可用 bash',
  };
}
