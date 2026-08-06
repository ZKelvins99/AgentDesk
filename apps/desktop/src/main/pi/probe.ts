import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { PiCommand, PiModel, PiSessionState } from '@agentdesk/pi-protocol';
import { type BashProbe, detectBash } from './bash-detect';
import { PiSidecar } from './sidecar';

const execFileAsync = promisify(execFile);

export interface KernelProbeOptions {
  binary: string;
  cwd: string;
  sessionDir: string;
  agentDir?: string;
  timeoutMs?: number;
}

export interface KernelProbeResult {
  ok: boolean;
  version: string | null;
  state: PiSessionState | null;
  models: PiModel[];
  commands: PiCommand[];
  bash: BashProbe;
  error?: string;
}

/**
 * 内核探测与健康检查（README M1）：
 * pi --version + spawn 后 get_state / get_available_models / get_commands 探活。
 */
export async function probeKernel(options: KernelProbeOptions): Promise<KernelProbeResult> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const bash = await detectBash();

  let version: string | null = null;
  try {
    const { stdout } = await execFileAsync(options.binary, ['--version'], {
      timeout: timeoutMs,
      windowsHide: true,
    });
    version = stdout.trim() || null;
  } catch (err) {
    return {
      ok: false,
      version: null,
      state: null,
      models: [],
      commands: [],
      bash,
      error: `pi --version 失败：${(err as Error).message}`,
    };
  }

  const sidecarOptions: {
    binary: string;
    cwd: string;
    sessionDir: string;
    agentDir?: string;
    trust: 'deny';
    offline: true;
    sessionId: string;
  } = {
    binary: options.binary,
    cwd: options.cwd,
    sessionDir: options.sessionDir,
    trust: 'deny',
    offline: true,
    sessionId: 'kernel-probe',
  };
  if (options.agentDir) sidecarOptions.agentDir = options.agentDir;
  const sidecar = new PiSidecar(sidecarOptions);
  sidecar.start();

  try {
    const state = (await sidecar.waitReady(timeoutMs)) as PiSessionState;
    const modelsData = (await sidecar.command('get_available_models', {}, { timeoutMs })) as {
      models: PiModel[];
    };
    const commandsData = (await sidecar.command('get_commands', {}, { timeoutMs })) as {
      commands: PiCommand[];
    };
    return {
      ok: true,
      version,
      state,
      models: modelsData.models ?? [],
      commands: commandsData.commands ?? [],
      bash,
    };
  } catch (err) {
    return {
      ok: false,
      version,
      state: null,
      models: [],
      commands: [],
      bash,
      error: `内核探测失败：${(err as Error).message}`,
    };
  } finally {
    await sidecar.terminate(timeoutMs).catch(() => {});
  }
}
