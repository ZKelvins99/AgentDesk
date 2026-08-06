import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentDeskEvent, ApprovalRequestView } from '@agentdesk/ipc';
import {
  type MockProvider,
  type MockScenario,
  mockModelsJson,
  startMockProvider,
  textScenario,
  toolCallsScenario,
} from '@agentdesk/mock-provider';
import type { ApprovalMode } from '@agentdesk/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AskResponse } from '../approval';
import { ApprovalEngine, ApprovalStore, UplinkServer } from '../approval';
import { PiBridge, SidecarPool } from '../pi';
import { openDatabase } from '../storage/db';
import { SessionStore } from '../storage/session-store';
import { SessionManager } from './session-manager';

/** G5 集成验收：真实 pi + Bridge Extension + uplink，README 8.2/8.7 权限拦截。*/
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BINARY =
  process.env.PI_BINARY ??
  path.resolve(
    HERE,
    '../../../resources/bin',
    `${process.platform}-${process.arch}`,
    process.platform === 'win32' ? 'pi.exe' : 'pi',
  );
const BRIDGE_EXT = path.resolve(HERE, '../../../resources/pi-ext/agentdesk-bridge/index.ts');
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
  throw new Error(`waitFor 超时：${timeoutMs}ms`);
}

describe.skipIf(skipIntegration)(
  'G5 权限与审批（真实 pi + Bridge Extension + uplink，README 8.7/G5）',
  () => {
    let root: string;
    let workspaceDir: string;
    let sessionDir: string;
    let agentDir: string;
    let store: SessionStore;

    beforeAll(() => {
      root = mkdtempSync(path.join(tmpdir(), 'agentdesk-approval-it-'));
      workspaceDir = path.join(root, 'workspace');
      sessionDir = path.join(root, 'sessions');
      agentDir = path.join(root, 'agent');
      for (const dir of [workspaceDir, sessionDir, agentDir]) {
        mkdirSync(dir, { recursive: true });
      }
      store = new SessionStore(
        openDatabase(path.join(root, 'agentdesk.db')),
        path.join(root, 'exports'),
      );
    });

    afterAll(async () => {
      store.close();
      if (root) {
        for (let attempt = 0; attempt < 5; attempt += 1) {
          try {
            rmSync(root, { recursive: true, force: true });
            break;
          } catch {
            await new Promise((r) => setTimeout(r, 250));
          }
        }
      }
    });

    interface TestEnv {
      manager: SessionManager;
      pool: SidecarPool;
      engine: ApprovalEngine;
      uplink: UplinkServer;
      appDb: ReturnType<typeof openDatabase>;
      mock: MockProvider;
      askCalls: number;
    }

    async function makeManager(opts: {
      scenario: MockScenario[];
      defaultApprovalMode: ApprovalMode;
      ask?: (req: ApprovalRequestView) => Promise<AskResponse | 'timeout'>;
    }): Promise<TestEnv> {
      const mock = await startMockProvider({ scenario: opts.scenario });
      writeFileSync(path.join(agentDir, 'models.json'), mockModelsJson(mock.baseUrl));
      const appDb = openDatabase(':memory:');
      const approvalStore = new ApprovalStore(appDb);
      let askCalls = 0;
      let managerRef: SessionManager | null = null;
      const engine = new ApprovalEngine({
        store: approvalStore,
        getApprovalMode: (id) => managerRef?.approvalModeOf(id) ?? opts.defaultApprovalMode,
        getWorkspacePath: (id) => managerRef?.workspacePathOf(id) ?? workspaceDir,
        ask: async (req) => {
          askCalls += 1;
          return opts.ask ? opts.ask(req) : { decision: 'deny' };
        },
        timeoutMs: 1_500,
      });
      const uplink = new UplinkServer({ engine });
      await uplink.listen();
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
        approvalEngine: engine,
        uplink,
        extensionPath: BRIDGE_EXT,
        defaultApprovalMode: opts.defaultApprovalMode,
      });
      managerRef = manager;
      return {
        manager,
        pool,
        engine,
        uplink,
        appDb,
        mock,
        get askCalls() {
          return askCalls;
        },
      };
    }

    async function settleCount(
      events: Array<{ sessionId: string; seq: number; ev: AgentDeskEvent }>,
      sessionId: string,
      count: number,
      timeoutMs = 120_000,
    ): Promise<void> {
      await waitFor(
        () =>
          events.filter((e) => e.sessionId === sessionId && e.ev.k === 'agent.settled').length >=
          count,
        timeoutMs,
      );
    }

    it('G5 场景 3：拒绝并说明后模型收到 reason（Bridge Extension 拦截 write .env）', {
      timeout: 180_000,
    }, async () => {
      const env = await makeManager({
        scenario: [
          toolCallsScenario([
            {
              id: 'call_env',
              name: 'write',
              args: { path: path.join(workspaceDir, '.env'), content: 'SECRET=1' },
            },
          ]),
          textScenario(['好的，我不会写入凭证文件。']),
        ],
        defaultApprovalMode: 'read-only',
        ask: async () => ({ decision: 'deny-with-reason', reason: '请勿写入凭证文件' }),
      });
      try {
        const events: Array<{ sessionId: string; seq: number; ev: AgentDeskEvent }> = [];
        env.manager.emit = (sessionId, seq, ev) => events.push({ sessionId, seq, ev });
        const sessionId = await env.manager.create();
        await env.manager.send(sessionId, '写入 .env');
        await settleCount(events, sessionId, 1);

        expect(existsSync(path.join(workspaceDir, '.env'))).toBe(false);
        expect(env.askCalls).toBe(1);
        const audit = env.engine.store.listAudit({ sessionId });
        const entry = audit.find((a) => a.tool === 'write' && a.decision === 'deny-reason');
        expect(entry?.decision).toBe('deny-reason');
        const toolEnd = events.find((e) => e.ev.k === 'tool.end' && e.ev.callId === 'call_env');
        expect(toolEnd?.ev.k === 'tool.end' ? toolEnd.ev.ok : true).toBe(false);
        const last = env.mock.calls.at(-1);
        expect(JSON.stringify(last?.messages)).toContain('请勿写入凭证文件');
      } finally {
        await env.manager.shutdownAll(3_000);
        env.pool.dispose();
        await env.uplink.close();
        env.appDb.close();
        await env.mock.close();
      }
    });

    it('G5 场景 4：auto-edit 工作区内自动放行写出；read-only 拒绝写入', {
      timeout: 240_000,
    }, async () => {
      const env = await makeManager({
        scenario: [
          toolCallsScenario([
            {
              id: 'call_w1',
              name: 'write',
              args: { path: path.join(workspaceDir, 'notes.txt'), content: 'hello auto-edit' },
            },
          ]),
          textScenario(['已写入']),
          toolCallsScenario([
            {
              id: 'call_w2',
              name: 'write',
              args: { path: path.join(workspaceDir, 'notes2.txt'), content: 'blocked' },
            },
          ]),
          textScenario(['完成']),
        ],
        defaultApprovalMode: 'auto-edit',
        ask: async () => ({ decision: 'deny' }),
      });
      try {
        const events: Array<{ sessionId: string; seq: number; ev: AgentDeskEvent }> = [];
        env.manager.emit = (sessionId, seq, ev) => events.push({ sessionId, seq, ev });
        const sessionId = await env.manager.create();
        await env.manager.send(sessionId, '写入笔记');
        await settleCount(events, sessionId, 1);
        expect(readFileSync(path.join(workspaceDir, 'notes.txt'), 'utf8')).toBe('hello auto-edit');
        expect(env.askCalls).toBe(0);

        await env.manager.setApprovalMode(sessionId, 'read-only');
        await env.manager.send(sessionId, '再写一个');
        await settleCount(events, sessionId, 2);

        expect(existsSync(path.join(workspaceDir, 'notes2.txt'))).toBe(false);
        expect(env.askCalls).toBe(1);
        const audit = env.engine.store.listAudit({ sessionId });
        expect(audit.some((a) => a.tool === 'write' && a.decision === 'auto-allow')).toBe(true);
        expect(audit.some((a) => a.tool === 'write' && a.decision === 'deny')).toBe(true);
      } finally {
        await env.manager.shutdownAll(3_000);
        env.pool.dispose();
        await env.uplink.close();
        env.appDb.close();
        await env.mock.close();
      }
    });

    it('G5 超时：full-access 下高危仍询问，超时默认拒绝', { timeout: 180_000 }, async () => {
      const env = await makeManager({
        scenario: [
          toolCallsScenario([
            {
              id: 'call_rsa',
              name: 'write',
              args: { path: path.join(workspaceDir, 'id_rsa'), content: 'private-key' },
            },
          ]),
          textScenario(['明白']),
        ],
        defaultApprovalMode: 'full-access',
        ask: () => new Promise<AskResponse>(() => {}),
      });
      try {
        const events: Array<{ sessionId: string; seq: number; ev: AgentDeskEvent }> = [];
        env.manager.emit = (sessionId, seq, ev) => events.push({ sessionId, seq, ev });
        const sessionId = await env.manager.create();
        await env.manager.send(sessionId, '写入密钥');
        await settleCount(events, sessionId, 1, 90_000);

        expect(existsSync(path.join(workspaceDir, 'id_rsa'))).toBe(false);
        expect(env.askCalls).toBe(1);
        const audit = env.engine.store.listAudit({ sessionId });
        const entry = audit.find((a) => a.tool === 'write' && a.decision === 'timeout-deny');
        expect(entry?.decision).toBe('timeout-deny');
        expect(entry?.risk).toBe('high');
        const toolEnd = events.find((e) => e.ev.k === 'tool.end' && e.ev.callId === 'call_rsa');
        expect(toolEnd?.ev.k === 'tool.end' ? toolEnd.ev.ok : true).toBe(false);
      } finally {
        await env.manager.shutdownAll(3_000);
        env.pool.dispose();
        await env.uplink.close();
        env.appDb.close();
        await env.mock.close();
      }
    });
  },
);
