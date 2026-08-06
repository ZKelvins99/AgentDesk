import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentDeskEvent } from '@agentdesk/ipc';
import {
  type MockProvider,
  mockModelsJson,
  startMockProvider,
  textScenario,
} from '@agentdesk/mock-provider';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PiBridge, SidecarPool } from '../pi';
import { SessionManager, type SessionSnapshot } from './session-manager';

/** G2 集成验收：真实 pi + 本地 mock provider，完整跑多回合对话（README 14.2）。 */
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

describe.skipIf(skipIntegration)(
  'SessionManager 集成（真实内核 + mock provider，G2 多回合）',
  () => {
    let mock: MockProvider;
    let root: string;
    let manager: SessionManager;
    let pool: SidecarPool;
    let events: Array<{ sessionId: string; seq: number; ev: AgentDeskEvent }>;

    beforeAll(async () => {
      mock = await startMockProvider({
        scenario: textScenario(['第一回合回复', '第二回合回复'], 8),
      });
      root = mkdtempSync(path.join(tmpdir(), 'agentdesk-sess-it-'));
      const workspaceDir = path.join(root, 'workspace');
      const sessionDir = path.join(root, 'sessions');
      const agentDir = path.join(root, 'agent');
      for (const dir of [workspaceDir, sessionDir, agentDir]) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(path.join(agentDir, 'models.json'), mockModelsJson(mock.baseUrl));

      events = [];
      pool = new SidecarPool({ idleTimeoutMs: 0 });
      const bridge = new PiBridge({ binary: BINARY, pool });
      manager = new SessionManager({
        bridge,
        workspacePath: workspaceDir,
        sessionDir,
        defaultProvider: 'mock',
        defaultModel: 'mock-model',
        trust: 'allow',
        agentDir,
        offline: true,
        onEvent: (sessionId, seq, ev) => events.push({ sessionId, seq, ev }),
      });
    });

    afterAll(async () => {
      await manager.shutdownAll(3_000).catch(() => {});
      pool.dispose();
      if (mock) await mock.close();
      if (root) rmSync(root, { recursive: true, force: true });
    });

    it('create → 两回合对话 → 事件流完整 → attach 快照可恢复', { timeout: 180_000 }, async () => {
      const sessionId = await manager.create();
      expect(sessionId).toBeTruthy();
      expect(manager.attach(sessionId).state.model).toBe('mock-model');

      const r1 = await manager.send(sessionId, '你好');
      expect(r1).toEqual({ accepted: true, mode: 'normal' });
      await waitFor(
        () => events.some((e) => e.sessionId === sessionId && e.ev.k === 'agent.settled'),
        60_000,
      );

      const r2 = await manager.send(sessionId, '第二回合');
      expect(r2.accepted).toBe(true);
      await waitFor(
        () =>
          events.filter((e) => e.sessionId === sessionId && e.ev.k === 'agent.settled').length >= 2,
        60_000,
      );

      const sessionEvents = events.filter((e) => e.sessionId === sessionId);
      const seqs = sessionEvents.map((e) => e.seq);
      expect([...seqs].sort((a, b) => a - b)).toEqual(seqs); // 单调递增

      const text = sessionEvents
        .filter(
          (
            e,
          ): e is {
            sessionId: string;
            seq: number;
            ev: Extract<AgentDeskEvent, { k: 'msg.delta' }>;
          } => e.ev.k === 'msg.delta' && e.ev.part.t === 'text',
        )
        .map((e) => (e.ev.part as { t: 'text'; v: string }).v)
        .join('');
      expect(text).toContain('第一回合回复');
      expect(text).toContain('第二回合回复');

      const snap: SessionSnapshot = manager.attach(sessionId);
      expect(snap.seq).toBe(sessionEvents[sessionEvents.length - 1]?.seq ?? 0);
      expect(snap.seq).toBeGreaterThan(0);
      expect(snap.workspacePath).toBeTruthy();
      expect(snap.history.some((e) => e.k === 'msg.start')).toBe(true);
      expect(snap.history.some((e) => e.k === 'msg.end')).toBe(true);
    });
  },
);
