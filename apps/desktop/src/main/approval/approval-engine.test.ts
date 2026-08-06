import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../storage/db';
import { ApprovalEngine, type ApprovalEngineOptions, type AskResponse } from './approval-engine';
import { ApprovalStore } from './approval-store';

interface Env {
  db: ReturnType<typeof openDatabase>;
  store: ApprovalStore;
  engine: ApprovalEngine;
  asked: string[];
  setAsk: (
    fn: (req: import('@agentdesk/ipc').ApprovalRequestView) => Promise<AskResponse | 'timeout'>,
  ) => void;
}

function makeEngine(overrides: Partial<ApprovalEngineOptions> = {}): Env {
  const db = openDatabase(':memory:');
  const store = new ApprovalStore(db);
  const asked: string[] = [];
  let askImpl: (
    req: import('@agentdesk/ipc').ApprovalRequestView,
  ) => Promise<AskResponse | 'timeout'> = async () => ({ decision: 'allow-once' });
  const engine = new ApprovalEngine({
    store,
    getApprovalMode: () => 'full-access',
    getWorkspacePath: () => path.resolve('/ws'),
    ask: async (req) => {
      asked.push(req.tool);
      return askImpl(req);
    },
    timeoutMs: 30_000,
    ...overrides,
  });
  return {
    db,
    store,
    engine,
    asked,
    setAsk: (fn) => {
      askImpl = fn;
    },
  };
}

function input(tool: string, payload: unknown, cwd = path.resolve('/ws')) {
  return { sessionId: 's1', tool, input: payload, cwd };
}

describe('ApprovalEngine（README 8.7.3）', () => {
  const envs: Env[] = [];
  afterEach(() => {
    for (const e of envs.splice(0)) e.db.close();
  });
  function track(e: Env): Env {
    envs.push(e);
    return e;
  }

  it('plan：read 放行，bash/write 拒绝并附 plan 理由', async () => {
    const { engine, asked } = track(makeEngine({ getApprovalMode: () => 'plan' }));
    const read = await engine.decide(input('read', { path: 'a.ts' }));
    expect(read.decision).toBe('allow');
    const bash = await engine.decide(input('bash', { command: 'ls' }));
    expect(bash.decision).toBe('deny');
    expect(bash.reason).toContain('plan');
    const write = await engine.decide(input('write', { path: 'a.txt' }));
    expect(write.decision).toBe('deny');
    expect(asked).toEqual([]);
  });

  it('read-only：read 放行，write 询问；拒绝并说明回传理由', async () => {
    const { engine, asked, setAsk } = track(makeEngine({ getApprovalMode: () => 'read-only' }));
    const read = await engine.decide(input('read', { path: 'a.ts' }));
    expect(read.decision).toBe('allow');
    setAsk(async () => ({ decision: 'deny-with-reason', reason: '请勿写入' }));
    const write = await engine.decide(input('write', { path: 'a.txt' }));
    expect(write.decision).toBe('deny');
    expect(write.reason).toBe('请勿写入');
    expect(asked).toEqual(['write']);
  });

  it('auto-edit：工作区内 write/edit 自动放行，工作区外询问', async () => {
    const { engine, asked, setAsk } = track(makeEngine({ getApprovalMode: () => 'auto-edit' }));
    const inside = await engine.decide(input('write', { path: 'a.txt' }));
    expect(inside.decision).toBe('allow');
    const edit = await engine.decide(input('edit', { path: 'b.txt' }));
    expect(edit.decision).toBe('allow');
    expect(asked).toEqual([]);
    setAsk(async () => ({ decision: 'deny' }));
    const outside = await engine.decide(input('write', { path: path.join('..', 'x.txt') }));
    expect(outside.decision).toBe('deny');
    expect(asked).toEqual(['write']);
  });

  it('full-access：低危自动放行，高危仍询问', async () => {
    const { engine, asked, setAsk } = track(makeEngine({ getApprovalMode: () => 'full-access' }));
    const low = await engine.decide(input('bash', { command: 'git status' }));
    expect(low.decision).toBe('allow');
    expect(asked).toEqual([]);
    setAsk(async () => ({ decision: 'deny' }));
    const high = await engine.decide(input('bash', { command: 'rm -rf /tmp/x' }));
    expect(high.decision).toBe('deny');
    expect(asked).toEqual(['bash']);
  });

  it('超时默认拒绝（G5）', async () => {
    const { engine } = track(makeEngine({ getApprovalMode: () => 'read-only', timeoutMs: 60 }));
    engine.setAskHandler(() => new Promise<AskResponse>(() => {}));
    const out = await engine.decide(input('write', { path: 'a.txt' }));
    expect(out.decision).toBe('deny');
    expect(out.reason).toContain('超时');
  });

  it('always：写入会话规则并放行，同工具后续不再询问', async () => {
    const { engine, store, asked, setAsk } = track(
      makeEngine({ getApprovalMode: () => 'read-only' }),
    );
    setAsk(async () => ({ decision: 'always' }));
    const first = await engine.decide(input('write', { path: 'a.txt' }));
    expect(first.decision).toBe('allow');
    expect(first.ruleId).toBeTruthy();
    expect(asked).toEqual(['write']);
    const second = await engine.decide(input('write', { path: 'b.txt' }));
    expect(second.decision).toBe('allow');
    expect(second.ruleId).toBeTruthy();
    expect(asked).toEqual(['write']);
    const rules = store.listRules({ sessionId: 's1' });
    expect(rules.some((r) => r.decision === 'allow' && r.scope === 'session')).toBe(true);
  });

  it('全局规则优先：deny 规则命中直接拒绝', async () => {
    const { engine, store, asked } = track(makeEngine({ getApprovalMode: () => 'full-access' }));
    store.saveRule({ scope: 'global', matcher: { tool: 'bash' }, decision: 'deny' });
    const out = await engine.decide(input('bash', { command: 'git status' }));
    expect(out.decision).toBe('deny');
    expect(out.ruleId).toBeTruthy();
    expect(asked).toEqual([]);
  });

  it('每次决策写入审计', async () => {
    const { engine, store } = track(makeEngine({ getApprovalMode: () => 'plan' }));
    await engine.decide(input('read', { path: 'a.ts' }));
    await engine.decide(input('bash', { command: 'ls' }));
    const entries = store.listAudit({ sessionId: 's1' });
    expect(entries).toHaveLength(2);
    expect(entries.some((e) => e.decision === 'auto-allow')).toBe(true);
    const deny = entries.find((e) => e.decision === 'mode-deny');
    expect(deny?.risk).toBe('low');
    expect(deny?.tool).toBe('bash');
  });
});
