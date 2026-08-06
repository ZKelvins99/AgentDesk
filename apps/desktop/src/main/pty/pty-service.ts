/**
 * PTY 服务（README 9.6 / M8）。
 * 使用 node-pty 驱动 xterm.js；ABI 不匹配时 available=false，
 * 终端面板降级为禁用而非崩溃（README R5）。
 */
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import type { BrowserWindow } from 'electron';
import type { IDisposable, IPty } from 'node-pty';

interface PtySession {
  pty: IPty;
  disposables: IDisposable[];
}

let nodePty: typeof import('node-pty') | null = null;
let abiAvailable = false;

/** 尝试加载 node-pty；ABI 不匹配时静默降级。 */
function tryLoadNodePty(): boolean {
  if (nodePty !== null) return abiAvailable;
  try {
    nodePty = require('node-pty') as typeof import('node-pty');
    abiAvailable = true;
  } catch (e) {
    // ABI 不匹配或未编译 —— 降级为不可用（README R5）
    console.warn('[PtyService] node-pty unavailable, terminal panel disabled:', e);
    abiAvailable = false;
  }
  return abiAvailable;
}

/** 惰获取主窗口：在 IPC handler 执行时窗口必然已创建。 */
function getMainWindow(): BrowserWindow | undefined {
  // 延迟导入避免循环依赖
  const { BrowserWindow: BW } = require('electron') as typeof import('electron');
  return BW.getAllWindows()[0];
}

export class PtyService {
  private sessions = new Map<string, PtySession>();

  constructor() {
    tryLoadNodePty();
  }

  /** 创建一个 PTY 实例，返回 ptyId 与 available 标志。 */
  create(cwd: string, cols = 80, rows = 24): { ptyId: string; available: boolean } {
    if (!abiAvailable || !nodePty) {
      return { ptyId: '', available: false };
    }

    const shell = detectShell();
    const ptyId = randomUUID();

    const pty = nodePty.spawn(shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      } as NodeJS.ProcessEnv,
    });

    const disposables: IDisposable[] = [];

    // 输出 → 渲染层 event:pty
    const onData = pty.onData((data: string) => {
      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send('event:pty', { ptyId, data });
      }
    });
    disposables.push(onData);

    // 进程退出：发送退出码消息并清理
    const onExit = pty.onExit(({ exitCode }) => {
      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send('event:pty', {
          ptyId,
          data: `\r\n[进程已退出，退出码 ${exitCode}]\r\n`,
        });
      }
      this.cleanup(ptyId);
    });
    disposables.push(onExit);

    this.sessions.set(ptyId, { pty, disposables });
    return { ptyId, available: true };
  }

  write(ptyId: string, data: string): void {
    this.sessions.get(ptyId)?.pty.write(data);
  }

  resize(ptyId: string, cols: number, rows: number): void {
    this.sessions.get(ptyId)?.pty.resize(cols, rows);
  }

  kill(ptyId: string): void {
    const session = this.sessions.get(ptyId);
    if (session) {
      try {
        session.pty.kill();
      } catch {
        // 进程可能已退出
      }
      this.cleanup(ptyId);
    }
  }

  private cleanup(ptyId: string): void {
    const session = this.sessions.get(ptyId);
    if (!session) return;
    for (const d of session.disposables) {
      try {
        d.dispose();
      } catch {
        // 忽略
      }
    }
    this.sessions.delete(ptyId);
  }

  /** 应用退出时清理全部 PTY */
  killAll(): void {
    for (const ptyId of this.sessions.keys()) {
      this.kill(ptyId);
    }
  }

  get isAvailable(): boolean {
    return abiAvailable;
  }
}

/**
 * 探测 shell（README 9.6 / 12.4 Windows bash 探测顺序）。
 * Windows：优先 shellPath 配置 → Git Bash → MSYS2 bash → WSL → PowerShell。
 * macOS/Linux：$SHELL → /bin/bash。
 */
function detectShell(): string {
  if (process.platform === 'win32') {
    return detectWindowsShell();
  }
  return process.env.SHELL ?? '/bin/bash';
}

function detectWindowsShell(): string {
  const candidates = [
    // Git Bash（最常见）
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    // MSYS2
    'C:\\msys64\\usr\\bin\\bash.exe',
    'C:\\msys32\\usr\\bin\\bash.exe',
  ];

  for (const p of candidates) {
    try {
      const fs = require('node:fs') as typeof import('node:fs');
      if (fs.existsSync(p)) return p;
    } catch {}
  }

  // 尝试 WSL（用 spawnSync 避免 shell 注入）
  try {
    const { spawnSync } = require('node:child_process') as typeof import('node:child_process');
    const r = spawnSync('wsl.exe', ['--status'], { timeout: 2000, stdio: 'ignore' });
    if (r.status === 0) return 'wsl.exe';
  } catch {
    // WSL 不可用
  }

  // 降级到 PowerShell Core 或 cmd
  const pwsh = `${os.homedir()}\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe`;
  try {
    const fs = require('node:fs') as typeof import('node:fs');
    if (fs.existsSync(pwsh)) return pwsh;
  } catch {
    // 忽略
  }

  return 'cmd.exe';
}
