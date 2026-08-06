import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../storage/db';
import { ApprovalEngine } from './approval-engine';
import { ApprovalStore } from './approval-store';
import { UplinkServer } from './uplink-server';

describe('UplinkServer（README 8.2.2）', () => {
  let db: ReturnType<typeof openDatabase>;
  let store: ApprovalStore;
  let engine: ApprovalEngine;
  let server: UplinkServer;
  const logs: Array<{ sessionId?: string; level?: string; message?: string }> = [];

  beforeEach(async () => {
    logs.length = 0;
    db = openDatabase(':memory:');
    store = new ApprovalStore(db);
    engine = new ApprovalEngine({
      store,
      getApprovalMode: () => 'full-access',
      getWorkspacePath: () => '/ws',
      ask: async () => ({ decision: 'deny' }),
    });
    server = new UplinkServer({ engine, onLog: (e) => logs.push(e) });
    await server.listen();
  });

  afterEach(async () => {
    await server.close();
    db.close();
  });

  it('未带 token 返回 401；Host 校验失败同样 401', async () => {
    const res = await fetch(`${server.url}/approval`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 's1',
        tool: 'bash',
        input: { command: 'echo hi' },
        cwd: '/ws',
      }),
    });
    expect(res.status).toBe(401);
  });

  it('带 token：POST /approval 由 engine 决策并返回', async () => {
    const res = await fetch(`${server.url}/approval`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${server.token}`,
      },
      body: JSON.stringify({
        sessionId: 's1',
        tool: 'bash',
        input: { command: 'git status' },
        cwd: '/ws',
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { decision: string; reason: string | null };
    expect(body.decision).toBe('allow');
  });

  it('缺少 sessionId/tool 返回 400', async () => {
    const res = await fetch(`${server.url}/approval`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${server.token}`,
      },
      body: JSON.stringify({ cwd: '/ws' }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /log 触发 onLog 回调', async () => {
    const res = await fetch(`${server.url}/log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${server.token}`,
      },
      body: JSON.stringify({ sessionId: 's1', level: 'warn', message: 'ext err' }),
    });
    expect(res.status).toBe(204);
    expect(logs).toEqual([{ sessionId: 's1', level: 'warn', message: 'ext err' }]);
  });

  it('GET /events 为 SSE 握手（M6 预留）', async () => {
    const res = await fetch(`${server.url}/events`, {
      headers: { Authorization: `Bearer ${server.token}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    await res.body?.cancel();
  });
});
