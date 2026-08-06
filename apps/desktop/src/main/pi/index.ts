import { type KernelProbeOptions, type KernelProbeResult, probeKernel } from './probe';
import type { PiSidecar, PiSidecarOptions } from './sidecar';
import type { SidecarPool } from './sidecar-pool';

export * from './agentdesk-events';
export * from './bash-detect';
export * from './event-normalizer';
export * from './jsonl';
export * from './probe';
export * from './rpc-client';
export * from './sidecar';
export * from './sidecar-pool';

export interface PiBridgeOptions {
  binary: string;
  pool: SidecarPool;
}

/**
 * PiBridge 门面：唯一对外入口。
 * 抽象层只保留这一层（README 1.3），不为第二内核预留接口。
 */
export class PiBridge {
  constructor(private readonly options: PiBridgeOptions) {}

  createSessionSidecar(
    sessionId: string,
    opts: Omit<PiSidecarOptions, 'binary' | 'sessionId' | 'onExit'>,
  ): PiSidecar {
    return this.options.pool.create(sessionId, {
      binary: this.options.binary,
      ...opts,
    });
  }

  probe(options: Omit<KernelProbeOptions, 'binary'>): Promise<KernelProbeResult> {
    return probeKernel({ binary: this.options.binary, ...options });
  }

  shutdownAll(timeoutMs?: number): Promise<void> {
    return this.options.pool.shutdownAll(timeoutMs);
  }
}
