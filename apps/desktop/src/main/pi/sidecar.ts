import { type ChildProcess, execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { promisify } from 'node:util';
import type { PiSessionState } from '@agentdesk/pi-protocol';
import { AgentDeskError } from '@agentdesk/shared';
import { normalizePiEvent } from './event-normalizer';
import { JsonlFramer } from './jsonl';
import { RpcClient } from './rpc-client';

const execFileAsync = promisify(execFile);

export type SidecarStatus = 'starting' | 'ready' | 'degraded' | 'exited';

export interface PiSidecarOptions {
  /** pi 二进制绝对路径（README 8.1.5 解析结果） */
  binary: string;
  /** 工作区路径（sidecar 的 cwd） */
  cwd: string;
  /** 会话目录（--session-dir） */
  sessionDir: string;
  sessionFile?: string;
  name?: string;
  provider?: string;
  model?: string;
  thinkingLevel?: string;
  /** Bridge Extension 路径（--extension，M5 起必须注入） */
  extensionPath?: string;
  /** TrustGate 决策：必须显式传 -a / -na（README 8.1.2 / R3） */
  trust: 'allow' | 'deny';
  offline?: boolean;
  /** 隔离 Profile：PI_CODING_AGENT_DIR */
  agentDir?: string;
  sessionId?: string;
  env?: Record<string, string>;
  /** stderr 环形缓冲行数（README 8.1.1 SidecarLog） */
  stderrRingSize?: number;
  onExit?: (info: { code: number | null; signal: string | null; expected: boolean }) => void;
}

export interface SidecarExitInfo {
  code: number | null;
  signal: string | null;
  expected: boolean;
}

/**
 * 一个会话对应一个 sidecar（README 8.1.3）。
 * 负责 spawn 参数矩阵、stdout 切帧喂 RpcClient、stderr 环形缓冲、事件归一化、进程清理。
 */
export class PiSidecar extends EventEmitter {
  readonly sessionId: string;
  status: SidecarStatus = 'starting';
  private readonly options: PiSidecarOptions;
  private child: ChildProcess | null = null;
  private readonly framer = new JsonlFramer();
  private rpc: RpcClient | null = null;
  private readonly stderrRing: string[] = [];
  private readonly stderrRingSize: number;
  private exitInfo: SidecarExitInfo | null = null;
  private expectedExit = false;
  private spawnError: Error | null = null;

  constructor(options: PiSidecarOptions) {
    super();
    this.options = options;
    this.sessionId = options.sessionId ?? randomUUID();
    this.stderrRingSize = options.stderrRingSize ?? 1000;
  }

  get pid(): number | null {
    return this.child?.pid ?? null;
  }

  get exited(): boolean {
    return this.status === 'exited';
  }

  /** 最近 stderr 行（环形缓冲，供诊断与 degraded 展示）。 */
  get recentStderr(): string[] {
    return [...this.stderrRing];
  }

  start(): void {
    if (this.child)
      throw new AgentDeskError({
        code: 'ALREADY_STARTED',
        scope: 'pi-bridge',
        userMessage: 'sidecar 已启动',
      });
    const args = this.buildArgs();
    const env = this.buildEnv();

    const child = spawn(this.options.binary, args, {
      cwd: this.options.cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.child = child;

    this.rpc = new RpcClient({ stdin: child.stdin });
    this.rpc.on('event', (event) => {
      for (const agentEvent of normalizePiEvent(event)) {
        this.emit('event', agentEvent);
      }
      this.emit('raw-event', event);
    });
    this.rpc.on('invalid', (raw, error) => {
      this.emit('parse-error', { raw, error });
    });

    child.stdout.on('data', (chunk: Buffer) => {
      for (const line of this.framer.push(chunk)) {
        this.rpc?.handleLine(line);
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString('utf8').split(/\r?\n/)) {
        if (line.trim()) {
          this.stderrRing.push(line);
          if (this.stderrRing.length > this.stderrRingSize) this.stderrRing.shift();
        }
      }
    });

    child.on('error', (err) => {
      this.spawnError = err;
      this.status = 'degraded';
      this.emit('spawn-error', err);
    });

    child.on('exit', (code, signal) => {
      for (const line of this.framer.flush()) {
        this.rpc?.handleLine(line);
      }
      this.rpc?.terminate(`sidecar exited code=${code} signal=${signal}`);
      this.rpc = null;
      this.status = 'exited';
      this.exitInfo = { code, signal, expected: this.expectedExit };
      this.emit('exit', this.exitInfo);
      this.options.onExit?.(this.exitInfo);
    });

    this.status = 'starting';
  }

  /** 探测 get_state 并转为 ready（10s 超时，README M1 内核探测）。 */
  async waitReady(timeoutMs = 10_000): Promise<PiSessionState> {
    const data = (await this.command('get_state', {}, { timeoutMs })) as PiSessionState;
    this.status = 'ready';
    return data;
  }

  /** 发送 RPC 命令并等待响应。 */
  command(
    command: string,
    params: Record<string, unknown> = {},
    opts: { timeoutMs?: number } = {},
  ): Promise<unknown> {
    if (this.spawnError) {
      return Promise.reject(
        new AgentDeskError({
          code: 'SIDECAR_SPAWN_FAILED',
          scope: 'pi-bridge',
          userMessage: 'sidecar 启动失败',
          cause: this.spawnError,
        }),
      );
    }
    if (!this.rpc || this.status === 'exited') {
      return Promise.reject(
        new AgentDeskError({
          code: 'SIDECAR_NOT_RUNNING',
          scope: 'pi-bridge',
          userMessage: 'sidecar 未在运行',
        }),
      );
    }
    return this.rpc.command(command, params, opts);
  }

  /**
   * 优雅退出：关闭 stdin 等进程自然退出，超时后逐级升级：
   * abort → SIGTERM/taskkill /T → SIGKILL/taskkill /T /F（README M1 进程清理）。
   */
  async terminate(timeoutMs = 8_000): Promise<SidecarExitInfo> {
    const child = this.child;
    if (!child || child.exitCode !== null || child.signalCode !== null) {
      return this.exitInfo ?? { code: null, signal: null, expected: true };
    }
    this.expectedExit = true;
    const pid = child.pid;
    try {
      child.stdin?.end();
    } catch {
      // 忽略：stdin 已关闭
    }
    if (await waitForExit(child, timeoutMs)) {
      return this.exitInfo ?? { code: null, signal: null, expected: true };
    }
    if (pid) await killProcessTree(pid, false, 3_000);
    if (await waitForExit(child, 3_000)) {
      return this.exitInfo ?? { code: null, signal: null, expected: true };
    }
    if (pid) await killProcessTree(pid, true, 3_000);
    return this.exitInfo ?? { code: null, signal: null, expected: true };
  }

  private buildArgs(): string[] {
    const o = this.options;
    const args = [o.binary, '--mode', 'rpc', '--session-dir', o.sessionDir];
    if (o.sessionFile) args.push('--session', o.sessionFile);
    if (o.name) args.push('--name', o.name);
    if (o.provider) args.push('--provider', o.provider);
    if (o.model) args.push('--model', o.model);
    if (o.thinkingLevel) args.push('--thinking', o.thinkingLevel);
    if (o.extensionPath) args.push('--extension', o.extensionPath);
    args.push(o.trust === 'allow' ? '-a' : '-na');
    if (o.offline) args.push('--offline');
    return args;
  }

  private buildEnv(): NodeJS.ProcessEnv {
    const o = this.options;
    const env: NodeJS.ProcessEnv = { ...process.env, PI_SKIP_VERSION_CHECK: '1' };
    if (o.agentDir) env.PI_CODING_AGENT_DIR = o.agentDir;
    if (o.offline) env.PI_OFFLINE = '1';
    if (o.sessionId) env.AGENTDESK_SESSION_ID = o.sessionId;
    if (o.env) Object.assign(env, o.env);
    return env;
  }
}

/** 等待进程退出，超时返回 false。 */
function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve(true);
      return;
    }
    const timer = setTimeout(() => {
      child.off('exit', onExit);
      resolve(false);
    }, timeoutMs);
    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
    };
    child.once('exit', onExit);
  });
}

/**
 * 清理进程树：Windows 用 taskkill /T（软）→ /F（强），Unix 用 SIGTERM → SIGKILL。
 */
export async function killProcessTree(
  pid: number,
  force: boolean,
  timeoutMs = 5_000,
): Promise<void> {
  if (process.platform === 'win32') {
    const args = ['/PID', String(pid), '/T'];
    if (force) args.push('/F');
    await execFileAsync('taskkill', args, { timeout: timeoutMs, windowsHide: true }).catch(() => {
      // 进程可能已退出
    });
  } else {
    try {
      process.kill(pid, force ? 'SIGKILL' : 'SIGTERM');
    } catch {
      // 进程可能已退出
    }
  }
}
