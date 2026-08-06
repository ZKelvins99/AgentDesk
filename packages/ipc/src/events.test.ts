import { describe, expect, it } from 'vitest';
import { EVENT_CHANNELS, IPC_CHANNELS, isIpcChannel } from './channels';
import { invokeRequestSchemas, sessionEventSchema } from './contracts';
import { agentDeskEventSchema } from './events';

describe('IPC 白名单', () => {
  it('所有通道都以 domain:action 命名', () => {
    for (const channel of [...Object.values(IPC_CHANNELS), ...Object.values(EVENT_CHANNELS)]) {
      expect(channel).toMatch(/^[a-z]+:[a-z-]+$/);
    }
  });

  it('每个 invoke 通道都有对应请求 schema', () => {
    for (const channel of Object.values(IPC_CHANNELS)) {
      expect(invokeRequestSchemas).toHaveProperty(channel);
    }
  });

  it('事件通道与 invoke 通道互不重叠', () => {
    const invoke = new Set<string>(Object.values(IPC_CHANNELS));
    for (const channel of Object.values(EVENT_CHANNELS)) {
      expect(invoke.has(channel)).toBe(false);
    }
  });

  it('isIpcChannel 覆盖事件通道并拒绝未知通道', () => {
    expect(isIpcChannel('app:ping')).toBe(true);
    expect(isIpcChannel('event:session')).toBe(true);
    expect(isIpcChannel('shell:exec')).toBe(false);
  });
});

describe('AgentDeskEvent 契约（README 8.1.4）', () => {
  it('能解析完整的会话事件流', () => {
    const events = [
      {
        k: 'session.state',
        state: {
          model: 'm',
          thinkingLevel: 'off',
          isStreaming: false,
          isCompacting: false,
          steeringMode: 'all',
          followUpMode: 'all',
          autoCompactionEnabled: true,
          approvalMode: 'full-access',
          messageCount: 1,
          pendingMessageCount: 0,
        },
      },
      { k: 'turn.start', turnId: 't1' },
      { k: 'msg.start', msgId: 'm1', role: 'assistant' },
      { k: 'msg.delta', msgId: 'm1', part: { t: 'text', v: 'hi' } },
      { k: 'msg.delta', msgId: 'm1', part: { t: 'thinking', v: '想' } },
      { k: 'msg.end', msgId: 'm1', usage: { input: 10, output: 5, costUsd: 0.001 } },
      { k: 'tool.start', callId: 'c1', name: 'read', args: { path: 'a.ts' } },
      { k: 'tool.progress', callId: 'c1', patch: null },
      { k: 'tool.end', callId: 'c1', ok: true, result: 'ok', ms: 12 },
      { k: 'bash.output', cmdId: 'b1', chunk: 'ls' },
      { k: 'queue', pending: 1, mode: 'steer' },
      { k: 'agent.settled' },
    ];
    for (const ev of events) {
      expect(agentDeskEventSchema.safeParse(ev).success).toBe(true);
    }
  });

  it('拒绝未知事件类型与非法负载', () => {
    expect(agentDeskEventSchema.safeParse({ k: 'nope' }).success).toBe(false);
    expect(
      agentDeskEventSchema.safeParse({ k: 'msg.delta', msgId: 'm1', part: { t: 'text' } }).success,
    ).toBe(false);
    expect(agentDeskEventSchema.safeParse({ k: 'msg.end', msgId: 'm1', usage: 'x' }).success).toBe(
      false,
    );
  });

  it('event:session 负载含 sessionId + 单调 seq', () => {
    const payload = {
      sessionId: 's1',
      seq: 3,
      ev: { k: 'msg.delta', msgId: 'm1', part: { t: 'text', v: 'hi' } },
    };
    expect(sessionEventSchema.parse(payload)).toEqual(payload);
  });
});
