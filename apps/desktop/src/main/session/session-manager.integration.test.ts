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
import { openDatabase } from '../storage/db';
import { SessionStore } from '../storage/session-store';
import { SessionManager, type SessionSnapshot } from './session-manager';

/** G2/G3 集成验收：真实 pi + 本地 mock provider（README 14.2），多回合 + 重启恢复。 */
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
  'SessionManager 集成（真实内核 + mock provider，G2 多回合 + G3 重启恢复）',
  () => {
    let mock: MockProvider;
    let root: string;
    let store: SessionStore;
    let dbPath: string;
    let workspaceDir: string;
    let sessionDir: string;
    let agentDir: string;

    beforeAll(async () => {
      mock = await startMockProvider({
        scenario: textScenario(['第一回合回复', '第二回合回复', '重启后第三回合'], 8),
      });
      root = mkdtempSync(path.join(tmpdir(), 'agentdesk-sess-it-'));
      workspaceDir = path.join(root, 'workspace');
      sessionDir = path.join(root, 'sessions');
      agentDir = path.join(root, 'agent');
      for (const dir of [workspaceDir, sessionDir, agentDir]) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(path.join(agentDir, 'models.json'), mockModelsJson(mock.baseUrl));
      dbPath = path.join(root, 'agentdesk.db');
      store = new SessionStore(openDatabase(dbPath), path.join(root, 'exports'));
    });

    afterAll(async () => {
      store.close();
      if (mock) await mock.close();
      if (root) rmSync(root, { recursive: true, force: true });
    });

    function makeManager(): { manager: SessionManager; pool: SidecarPool } {
      const pool = new SidecarPool({ idleTimeoutMs: 0 });
      const bridge = new PiBridge({ binary: BINARY, pool });
      const manager = new SessionManager({
        bridge,
        workspacePath: workspaceDir,
        sessionDir,
        store,
        defaultProvider: 'mock',
        defaultModel: 'mock-model',
        trust: 'allow',
        agentDir,
        offline: true,
        onEvent: () => {},
      });
      return { manager, pool };
    }

    it('create → 两回合对话 → 事件持久化 → attach 快照可恢复', { timeout: 180_000 }, async () => {
      const { manager, pool } = makeManager();
      const events: Array<{ sessionId: string; seq: number; ev: AgentDeskEvent }> = [];
      manager.emit = (sessionId, seq, ev) => events.push({ sessionId, seq, ev });

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

      // M3：事件已持久化到 SQLite 渲染缓存
      expect(store.latestSeq(sessionId)).toBe(snap.seq);
      expect(store.getSession(sessionId)).not.toBeNull();

      await manager.shutdownAll(3_000);
      pool.dispose();
    });

    it('重启恢复：attach 秒开读缓存 + sinceSeq 断点重传 + 后台 sidecar 校正后继续对话', {
      timeout: 180_000,
    }, async () => {
      const { manager: m1, pool: p1 } = makeManager();
      const events1: Array<{ sessionId: string; seq: number; ev: AgentDeskEvent }> = [];
      m1.emit = (sessionId, seq, ev) => events1.push({ sessionId, seq, ev });

      const sessionId = await m1.create();
      await m1.send(sessionId, '第一轮');
      await waitFor(
        () => events1.some((e) => e.sessionId === sessionId && e.ev.k === 'agent.settled'),
        60_000,
      );
      // 让 flush 落库
      await new Promise((r) => setTimeout(r, 200));
      const prevSeq = store.latestSeq(sessionId);
      expect(prevSeq).toBeGreaterThan(0);
      await m1.shutdownAll(3_000);
      p1.dispose();

      // 模拟重启：全新 manager + 同一 store
      const { manager: m2, pool: p2 } = makeManager();
      const events2: Array<{ sessionId: string; seq: number; ev: AgentDeskEvent }> = [];
      m2.emit = (sessionId, seq, ev) => events2.push({ sessionId, seq, ev });

      const restored = m2.attach(sessionId, 0);
      expect(restored.seq).toBe(prevSeq);
      expect(restored.history.length).toBeGreaterThan(0);
      expect(restored.history.some((e) => e.k === 'msg.start')).toBe(true);

      const tail = m2.attach(sessionId, prevSeq - 2);
      expect(tail.history.length).toBeLessThanOrEqual(2);
      expect(tail.seq).toBe(prevSeq);

      // 后台恢复（有 sessionFile 时）：sidecar 重建后 seq 连续、可继续对话
      const record = store.getSession(sessionId);
      if (record?.sessionFile) {
        await waitFor(() => m2.size > 0, 45_000);
        await waitFor(
          () => events2.some((e) => e.sessionId === sessionId && e.ev.k === 'session.state'),
          30_000,
        );
        await m2.send(sessionId, '重启后的第三回合');
        await waitFor(
          () =>
            events2.filter((e) => e.sessionId === sessionId && e.ev.k === 'agent.settled').length >=
            1,
          60_000,
        );
        const after = store.latestSeq(sessionId);
        expect(after).toBeGreaterThan(prevSeq);
        const text = events2
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
        expect(text).toContain('重启后第三回合');
      }

      await m2.shutdownAll(3_000);
      p2.dispose();
    });
  },
);
