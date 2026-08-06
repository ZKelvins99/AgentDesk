import type { AgentDeskEvent } from '@agentdesk/ipc';
import { describe, expect, it } from 'vitest';
import { createSessionUiState } from '../features/session/message-model';
import { type SessionEventPayload, useSessionStore } from './session-store';

describe('session-store：event:session 合流（README 5.3）', () => {
  it('按 seq 去重应用事件，跳过已应用序号', () => {
    const base = createSessionUiState('s1', '/work');
    useSessionStore.setState({
      sessions: { s1: base },
      activeSessionId: 's1',
    });

    const ev1: AgentDeskEvent = { k: 'msg.start', msgId: 'm1', role: 'assistant' };
    const ev2: AgentDeskEvent = { k: 'msg.delta', msgId: 'm1', part: { t: 'text', v: 'hi' } };
    const dup: SessionEventPayload[] = [
      { sessionId: 's1', seq: 1, ev: ev1 },
      { sessionId: 's1', seq: 2, ev: ev2 },
      { sessionId: 's1', seq: 2, ev: ev2 }, // 重复序号应被跳过
    ];
    useSessionStore.getState().applyEvents(dup);

    const s = useSessionStore.getState().sessions.s1;
    expect(s?.seq).toBe(2);
    expect(s?.messages).toHaveLength(1);
    expect(s?.messages[0]).toMatchObject({ kind: 'assistant', text: 'hi' });
  });

  it('不存在的会话事件被忽略', () => {
    const before = useSessionStore.getState().sessions;
    useSessionStore
      .getState()
      .applyEvents([{ sessionId: 'ghost', seq: 1, ev: { k: 'agent.settled' } }]);
    expect(useSessionStore.getState().sessions).toEqual(before);
  });

  it('性能代理：2000 条消息的 delta 批量应用在预算内', () => {
    const base = createSessionUiState('perf', '/work');
    const payloads: SessionEventPayload[] = [];
    let seq = 0;
    for (let m = 0; m < 200; m += 1) {
      payloads.push({
        sessionId: 'perf',
        seq: ++seq,
        ev: { k: 'msg.start', msgId: `m${m}`, role: 'assistant' },
      });
      for (let d = 0; d < 9; d += 1) {
        payloads.push({
          sessionId: 'perf',
          seq: ++seq,
          ev: { k: 'msg.delta', msgId: `m${m}`, part: { t: 'text', v: 'x' } },
        });
      }
    }
    const state = useSessionStore.getState();
    useSessionStore.setState({ sessions: { perf: base } });
    const start = performance.now();
    state.applyEvents(payloads);
    const elapsed = performance.now() - start;
    const s = useSessionStore.getState().sessions.perf;
    expect(s?.messages).toHaveLength(200);
    expect(s?.messages[0]).toMatchObject({ kind: 'assistant', text: 'xxxxxxxxx' });
    // 预算 2s（CI 宽松）；真实 55fps 由 M9 Playwright 回归验证
    expect(elapsed).toBeLessThan(2000);
  });
});
