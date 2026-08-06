import { EventEmitter } from 'node:events';
import { AgentDeskError } from '@agentdesk/shared';
import { PiSidecar, type PiSidecarOptions } from './sidecar';

export interface SidecarPoolOptions {
  /** 并发上限（README 5.4，默认 4） */
  maxConcurrent?: number;
  /** 空闲回收阈值（默认 30 分钟） */
  idleTimeoutMs?: number;
  /** 崩溃自动重启最大次数（默认 3） */
  restartMaxAttempts?: number;
  /** 重启退避基数（默认 1000ms，指数增长，封顶 30s） */
  restartBaseDelayMs?: number;
}

const MAX_BACKOFF_MS = 30_000;

/**
 * Sidecar 进程池：按 sessionId 索引。
 * - spawn / 复用 / 空闲回收 / 并发上限 / 崩溃指数退避重启
 */
export class SidecarPool extends EventEmitter {
  private readonly sidecars = new Map<string, PiSidecar>();
  private readonly options: Required<SidecarPoolOptions>;
  private readonly restartAttempts = new Map<string, number>();
  private readonly lastUsedAt = new Map<string, number>();
  private reclaimTimer: NodeJS.Timeout | null = null;

  constructor(options: SidecarPoolOptions = {}) {
    super();
    this.options = {
      maxConcurrent: options.maxConcurrent ?? 4,
      idleTimeoutMs: options.idleTimeoutMs ?? 30 * 60 * 1000,
      restartMaxAttempts: options.restartMaxAttempts ?? 3,
      restartBaseDelayMs: options.restartBaseDelayMs ?? 1000,
    };
    if (this.options.idleTimeoutMs > 0) {
      this.reclaimTimer = setInterval(() => this.reclaimIdle(), 30_000);
      this.reclaimTimer.unref();
    }
  }

  get size(): number {
    return this.sidecars.size;
  }

  get maxConcurrent(): number {
    return this.options.maxConcurrent;
  }

  /** 创建并登记一个 sidecar（未超过并发上限时）。 */
  create(sessionId: string, options: Omit<PiSidecarOptions, 'sessionId' | 'onExit'>): PiSidecar {
    if (this.sidecars.size >= this.options.maxConcurrent) {
      throw new AgentDeskError({
        code: 'SIDECAR_POOL_FULL',
        scope: 'pi-bridge',
        userMessage: `sidecar 并发已达上限（${this.options.maxConcurrent}）`,
      });
    }
    const existing = this.sidecars.get(sessionId);
    if (existing && !existing.exited) {
      return existing;
    }

    const sidecar = new PiSidecar({ ...options, sessionId });
    sidecar.on('exit', (info: { expected: boolean }) => {
      this.lastUsedAt.delete(sessionId);
      if (info.expected) {
        this.restartAttempts.delete(sessionId);
        this.sidecars.delete(sessionId);
      } else {
        this.scheduleRestart(sessionId, options);
      }
    });
    sidecar.on('event', () => this.touch(sessionId));
    sidecar.on('spawn-error', () => {
      this.sidecars.delete(sessionId);
      this.scheduleRestart(sessionId, options);
    });
    this.sidecars.set(sessionId, sidecar);
    this.touch(sessionId);
    this.emit('sidecar-created', { sessionId, sidecar });
    return sidecar;
  }

  get(sessionId: string): PiSidecar | undefined {
    return this.sidecars.get(sessionId);
  }

  touch(sessionId: string): void {
    this.lastUsedAt.set(sessionId, Date.now());
  }

  /** 显式移除（调用方负责先 terminate）。 */
  remove(sessionId: string): void {
    this.sidecars.delete(sessionId);
    this.lastUsedAt.delete(sessionId);
    this.restartAttempts.delete(sessionId);
  }

  /** 优雅退出全部 sidecar。 */
  async shutdownAll(timeoutMs = 8_000): Promise<void> {
    const sidecars = [...this.sidecars.values()];
    this.sidecars.clear();
    await Promise.allSettled(sidecars.map((s) => s.terminate(timeoutMs)));
  }

  private scheduleRestart(
    sessionId: string,
    options: Omit<PiSidecarOptions, 'sessionId' | 'onExit'>,
  ): void {
    const attempts = this.restartAttempts.get(sessionId) ?? 0;
    if (attempts >= this.options.restartMaxAttempts) {
      this.restartAttempts.delete(sessionId);
      this.sidecars.delete(sessionId);
      this.emit('restart-exhausted', sessionId);
      return;
    }
    const backoff = Math.min(this.options.restartBaseDelayMs * 2 ** attempts, MAX_BACKOFF_MS);
    this.restartAttempts.set(sessionId, attempts + 1);
    this.emit('restarting', { sessionId, attempt: attempts + 1, delayMs: backoff });
    setTimeout(() => {
      if (this.sidecars.has(sessionId)) return; // 已被替换
      const sidecar = new PiSidecar({ ...options, sessionId });
      sidecar.on('exit', (info: { expected: boolean }) => {
        this.lastUsedAt.delete(sessionId);
        if (info.expected) {
          this.restartAttempts.delete(sessionId);
          this.sidecars.delete(sessionId);
        } else {
          this.scheduleRestart(sessionId, options);
        }
      });
      sidecar.on('event', () => this.touch(sessionId));
      sidecar.on('spawn-error', () => {
        this.sidecars.delete(sessionId);
        this.scheduleRestart(sessionId, options);
      });
      sidecar.once('event', () => {
        if (sidecar.status === 'ready') this.restartAttempts.delete(sessionId);
      });
      this.sidecars.set(sessionId, sidecar);
      this.emit('sidecar-created', { sessionId, sidecar });
      sidecar.start();
    }, backoff);
  }

  /** 空闲回收：超过 idleTimeoutMs 未使用的 ready sidecar 被终止。 */
  private reclaimIdle(): void {
    const now = Date.now();
    for (const [sessionId, sidecar] of this.sidecars) {
      const lastUsed = this.lastUsedAt.get(sessionId) ?? 0;
      if (sidecar.status === 'ready' && now - lastUsed > this.options.idleTimeoutMs) {
        this.emit('idle-reclaim', sessionId);
        this.sidecars.delete(sessionId);
        this.lastUsedAt.delete(sessionId);
        void sidecar.terminate();
      }
    }
  }

  dispose(): void {
    if (this.reclaimTimer) clearInterval(this.reclaimTimer);
    this.reclaimTimer = null;
  }
}
