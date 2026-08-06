import { describe, expect, it } from 'vitest';
import { normalizePiEvent } from './event-normalizer';

describe('normalizePiEvent', () => {
  it('message_update text_delta → msg.delta(text)', () => {
    const events = normalizePiEvent({
      type: 'message_update',
      message: { role: 'assistant', content: [] },
      assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'Hi' },
    });
    expect(events).toEqual([
      { k: 'msg.delta', msgId: expect.any(String), part: { t: 'text', v: 'Hi' } },
    ]);
  });

  it('message_update thinking_delta → msg.delta(thinking)', () => {
    const events = normalizePiEvent({
      type: 'message_update',
      message: { role: 'assistant', content: [] },
      assistantMessageEvent: { type: 'thinking_delta', contentIndex: 0, delta: 'hmm' },
    });
    expect(events[0]).toMatchObject({ k: 'msg.delta', part: { t: 'thinking', v: 'hmm' } });
  });

  it('tool 生命周期折叠成 start/progress/end', () => {
    expect(
      normalizePiEvent({
        type: 'tool_execution_start',
        toolCallId: 'c1',
        toolName: 'bash',
        args: { command: 'ls' },
      }),
    ).toEqual([{ k: 'tool.start', callId: 'c1', name: 'bash', args: { command: 'ls' } }]);

    expect(
      normalizePiEvent({
        type: 'tool_execution_update',
        toolCallId: 'c1',
        toolName: 'bash',
        args: { command: 'ls' },
        partialResult: { content: 'partial' },
      }),
    ).toEqual([{ k: 'tool.progress', callId: 'c1', patch: { content: 'partial' } }]);

    expect(
      normalizePiEvent({
        type: 'tool_execution_end',
        toolCallId: 'c1',
        toolName: 'bash',
        result: { content: 'done' },
        isError: false,
      }),
    ).toEqual([{ k: 'tool.end', callId: 'c1', ok: true, result: { content: 'done' }, ms: 0 }]);
  });

  it('agent_settled / queue_update / compaction', () => {
    expect(normalizePiEvent({ type: 'agent_settled' })).toEqual([{ k: 'agent.settled' }]);
    expect(normalizePiEvent({ type: 'queue_update', steering: ['a'], followUp: [] })).toEqual([
      { k: 'queue', pending: 1, mode: 'steer' },
    ]);
    expect(
      normalizePiEvent({
        type: 'compaction_end',
        reason: 'threshold',
        result: { tokensBefore: 100, estimatedTokensAfter: 20 },
      }),
    ).toEqual([{ k: 'compact.end', before: 100, after: 20 }]);
  });

  it('extension_ui_request → ui.request', () => {
    const events = normalizePiEvent({
      type: 'extension_ui_request',
      id: 'u1',
      method: 'notify',
      message: 'hi',
      notifyType: 'info',
    });
    expect(events).toEqual([
      {
        k: 'ui.request',
        reqId: 'u1',
        kind: 'notify',
        payload: { message: 'hi', notifyType: 'info' },
      },
    ]);
  });

  it('message_end 带 usage → msg.end 带 usage', () => {
    const events = normalizePiEvent({
      type: 'message_end',
      message: {
        role: 'assistant',
        content: [],
        usage: { input: 10, output: 5, cost: { total: 0.03 } },
      },
    });
    expect(events[0]).toMatchObject({
      k: 'msg.end',
      usage: { input: 10, output: 5, costUsd: 0.03 },
    });
  });
});
