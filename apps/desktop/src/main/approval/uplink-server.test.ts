import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { McpServerDiscovery } from '../mcp/mcp-types';
import { McpCallError } from '../mcp/mcp-types';
import { openDatabase } from '../storage/db';
import { ApprovalEngine } from './approval-engine';
import { ApprovalStore } from './approval-store';
import { type UplinkMcpHost, UplinkServer } from './uplink-server';

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

describe('UplinkServer MCP 端点（M6 第三步：/mcp/tools /mcp/call /mcp/cancel + SSE 广播）', () => {
  let db: ReturnType<typeof openDatabase>;
  let store: ApprovalStore;
  let engine: ApprovalEngine;
  let server: UplinkServer;
  let discoveredWorkspace: string | undefined;
  let calledRequest: { server: string; tool: string; args: Record<string, unknown> } | undefined;
  let calledOptions:
    | { workspacePath?: string; timeoutMs?: number; signal?: AbortSignal }
    | undefined;
  let callMode: 'resolve' | 'hang' = 'resolve';

  const host: UplinkMcpHost = {
    async discoverTools(workspacePath) {
      discoveredWorkspace = workspacePath;
      const discovery: McpServerDiscovery = {
        name: 'sv',
        status: 'ready',
        error: null,
        tools: [
          {
            name: 'tool1',
            description: 't1',
            inputSchema: { type: 'object' },
            piName: 'mcp__sv__tool1',
            enabled: true,
            autoApprove: false,
          },
        ],
      };
      return [discovery];
    },
    async callTool(request, options) {
      calledRequest = request;
      calledOptions = options;
      if (callMode === 'resolve') {
        return { isError: false, content: [{ type: 'text', text: 'ok' }], raw: {} };
      }
      return new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => {
          reject(new McpCallError('aborted', 'cancelled'));
        });
      });
    },
  };

  beforeEach(async () => {
    discoveredWorkspace = undefined;
    calledRequest = undefined;
    calledOptions = undefined;
    callMode = 'resolve';
    db = openDatabase(':memory:');
    store = new ApprovalStore(db);
    engine = new ApprovalEngine({
      store,
      getApprovalMode: () => 'full-access',
      getWorkspacePath: () => '/ws',
      ask: async () => ({ decision: 'deny' }),
    });
    server = new UplinkServer({
      engine,
      mcp: host,
      resolveWorkspacePath: (sessionId) => (sessionId === 's1' ? '/ws/s1' : undefined),
    });
    await server.listen();
  });

  afterEach(async () => {
    await server.close();
    db.close();
  });

  it('GET /mcp/tools 返回工具清单并透传 workspacePath', async () => {
    const res = await fetch(`${server.url}/mcp/tools?sessionId=s1`, {
      headers: { Authorization: `Bearer ${server.token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { servers: McpServerDiscovery[] };
    expect(body.servers).toHaveLength(1);
    expect(body.servers[0]?.name).toBe('sv');
    expect(body.servers[0]?.tools[0]?.piName).toBe('mcp__sv__tool1');
    expect(discoveredWorkspace).toBe('/ws/s1');
  });

  it('GET /mcp/tools 缺 sessionId 返回 400', async () => {
    const res = await fetch(`${server.url}/mcp/tools`, {
      headers: { Authorization: `Bearer ${server.token}` },
    });
    expect(res.status).toBe(400);
  });

  it('POST /mcp/call 转发调用并返回规整结果', async () => {
    const res = await fetch(`${server.url}/mcp/call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${server.token}`,
      },
      body: JSON.stringify({
        sessionId: 's1',
        server: 'sv',
        tool: 'tool1',
        args: { a: 1 },
        callId: 'c1',
        timeoutMs: 5000,
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      isError: boolean;
      content: Array<{ type: string; text: string }>;
    };
    expect(body.isError).toBe(false);
    expect(body.content[0]?.text).toBe('ok');
    expect(calledRequest).toEqual({ server: 'sv', tool: 'tool1', args: { a: 1 } });
    expect(calledOptions?.workspacePath).toBe('/ws/s1');
    expect(calledOptions?.timeoutMs).toBe(5000);
  });

  it('POST /mcp/call 缺 sessionId/server/tool 返回 400', async () => {
    const res = await fetch(`${server.url}/mcp/call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${server.token}`,
      },
      body: JSON.stringify({ sessionId: 's1', server: 'sv' }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /mcp/cancel 中止进行中的调用并返回 aborted', async () => {
    callMode = 'hang';
    const callPromise = fetch(`${server.url}/mcp/call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${server.token}`,
      },
      body: JSON.stringify({ sessionId: 's1', server: 'sv', tool: 'tool1', callId: 'c2' }),
    });
    const cancelRes = await fetch(`${server.url}/mcp/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${server.token}`,
      },
      body: JSON.stringify({ callId: 'c2' }),
    });
    expect(cancelRes.status).toBe(204);
    const callRes = await callPromise;
    expect(callRes.status).toBe(200);
    const body = (await callRes.json()) as { isError: boolean; errorCode?: string };
    expect(body.isError).toBe(true);
    expect(body.errorCode).toBe('aborted');
  });

  it('GET /events 收到 mcp:changed 广播', async () => {
    const res = await fetch(`${server.url}/events`, {
      headers: { Authorization: `Bearer ${server.token}` },
    });
    expect(res.status).toBe(200);
    if (!res.body) throw new Error('missing response body');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    await new Promise((resolve) => setTimeout(resolve, 50));
    server.broadcast({ type: 'mcp:changed', data: { ok: true } });
    let received = '';
    while (!received.includes('mcp:changed')) {
      const { value, done } = await reader.read();
      if (done) break;
      received += decoder.decode(value, { stream: true });
    }
    expect(received).toContain('mcp:changed');
    await reader.cancel();
  });
});
