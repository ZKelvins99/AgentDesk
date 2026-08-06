import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type MockProvider,
  mockModelsJson,
  startMockProvider,
  textScenario,
} from '@agentdesk/mock-provider';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgentDeskEvent } from './agentdesk-events';
import { killProcessTree, PiSidecar, type SidecarExitInfo } from './sidecar';

/**
 * 内核集成测试（G1）：
 * 真实 pi 二进制 + 本地 mock OpenAI 兼容端点（@agentdesk/mock-provider），验证
 * spawn → 发一句 → msg.delta 流 → agent.settled → 优雅退出；杀进程可检测。
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BINARY =
  process.env.PI_BINARY ??
  path.resolve(
    HERE,
    '../../../resources/bin',
    `${process.platform}-${process.arch}`,
    process.platform === 'win32' ? 'pi.exe' : 'pi',
  );

const skipIntegration = !existsSync(BINARY);

interface TestEnv {
  workspaceDir: string;
  sessionDir: string;
  agentDir: string;
  cleanup: () => void;
}

function makeEnv(baseUrl: string): TestEnv {
  const root = mkdtempSync(path.join(tmpdir(), 'agentdesk-it-'));
  const workspaceDir = path.join(root, 'workspace');
  const sessionDir = path.join(root, 'sessions');
  const agentDir = path.join(root, 'agent');
  for (const dir of [workspaceDir, sessionDir, agentDir]) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path.join(agentDir, 'models.json'), mockModelsJson(baseUrl));
  return {
    workspaceDir,
    sessionDir,
    agentDir,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs: number,
  intervalMs = 100,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`waitFor 超时（${timeoutMs}ms）`);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

describe.skipIf(skipIntegration)('Pi Bridge 集成（真实内核 + mock provider）', () => {
  let mock: MockProvider;
  let env: TestEnv;
  const sidecars: PiSidecar[] = [];

  beforeAll(async () => {
    mock = await startMockProvider({
      scenario: textScenario(['Mock ', 'provider ', 'response'], 10),
    });
  });

  afterAll(async () => {
    await Promise.allSettled(sidecars.map((s) => s.terminate(2_000)));
    if (mock) await mock.close();
  });

  it('spawn → 发一句 → msg.delta → agent.settled → 优雅退出', { timeout: 90_000 }, async () => {
    env = makeEnv(mock.baseUrl);
    const sidecar = new PiSidecar({
      binary: BINARY,
      cwd: env.workspaceDir,
      sessionDir: env.sessionDir,
      agentDir: env.agentDir,
      provider: 'mock',
      model: 'mock-model',
      thinkingLevel: 'off',
      trust: 'allow',
      offline: true,
      sessionId: 'it-roundtrip',
    });
    sidecars.push(sidecar);
    const events: AgentDeskEvent[] = [];
    sidecar.on('event', (e: AgentDeskEvent) => events.push(e));
    sidecar.start();

    try {
      const state = await sidecar.waitReady(20_000);
      expect(state.sessionId).toBeTruthy();

      const accepted = (await sidecar.command(
        'prompt',
        { message: '请回复 mock ok' },
        { timeoutMs: 20_000 },
      )) as unknown;
      expect(accepted).toBeUndefined();

      await waitFor(() => events.some((e) => e.k === 'agent.settled'), 45_000);

      const text = events
        .filter(
          (e): e is Extract<AgentDeskEvent, { k: 'msg.delta' }> =>
            e.k === 'msg.delta' && e.part.t === 'text',
        )
        .map((e) => (e.part as { t: 'text'; v: string }).v)
        .join('');
      expect(text).toContain('Mock provider response');

      const exit = await sidecar.terminate(10_000);
      expect(exit.expected).toBe(true);
    } finally {
      await sidecar.terminate(2_000).catch(() => {});
      env.cleanup();
    }
  });

  it('杀进程能被检测到并上报（exit 事件）', { timeout: 60_000 }, async () => {
    env = makeEnv(mock.baseUrl);
    const sidecar = new PiSidecar({
      binary: BINARY,
      cwd: env.workspaceDir,
      sessionDir: env.sessionDir,
      agentDir: env.agentDir,
      provider: 'mock',
      model: 'mock-model',
      thinkingLevel: 'off',
      trust: 'allow',
      offline: true,
      sessionId: 'it-kill',
    });
    sidecars.push(sidecar);
    const exitPromise = once(sidecar, 'exit') as Promise<[SidecarExitInfo]>;
    sidecar.start();

    try {
      await sidecar.waitReady(20_000);
      const pid = sidecar.pid;
      expect(pid).toBeTruthy();
      await killProcessTree(pid as number, true, 5_000);
      const [info] = await withTimeout(exitPromise, 10_000, '杀进程后未收到 exit 事件');
      expect(info.expected).toBe(false);
    } finally {
      await sidecar.terminate(2_000).catch(() => {});
      env.cleanup();
    }
  });
});
