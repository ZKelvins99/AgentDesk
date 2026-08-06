import { describe, expect, it } from 'vitest';
import { parsePiLine } from './parse';

describe('parsePiLine', () => {
  it('解析 get_state 响应', () => {
    const parsed = parsePiLine(
      JSON.stringify({
        id: '1',
        type: 'response',
        command: 'get_state',
        success: true,
        data: {
          model: null,
          thinkingLevel: 'off',
          isStreaming: false,
          isCompacting: false,
          steeringMode: 'one-at-a-time',
          followUpMode: 'one-at-a-time',
          sessionId: 's1',
          autoCompactionEnabled: true,
          messageCount: 0,
          pendingMessageCount: 0,
        },
      }),
    );
    expect(parsed.kind).toBe('response');
    if (parsed.kind === 'response') {
      expect(parsed.response.id).toBe('1');
      expect(parsed.response.command).toBe('get_state');
    }
  });

  it('解析 message_update 事件（text_delta）', () => {
    const parsed = parsePiLine(
      JSON.stringify({
        type: 'message_update',
        message: { role: 'assistant', content: [] },
        assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'Hello' },
      }),
    );
    expect(parsed.kind).toBe('event');
    if (
      parsed.kind === 'event' &&
      parsed.event.type === 'message_update' &&
      parsed.event.assistantMessageEvent.type === 'text_delta'
    ) {
      expect(parsed.event.assistantMessageEvent.delta).toBe('Hello');
    }
  });

  it('解析 extension_ui_request', () => {
    const parsed = parsePiLine(
      JSON.stringify({ type: 'extension_ui_request', id: 'u1', method: 'notify', message: 'hi' }),
    );
    expect(parsed.kind).toBe('event');
    if (parsed.kind === 'event' && parsed.event.type === 'extension_ui_request') {
      expect(parsed.event.method).toBe('notify');
    }
  });

  it('拒绝非 JSON / 未知形状', () => {
    expect(parsePiLine('not json').kind).toBe('invalid');
    expect(parsePiLine('{"type":"bogus"}').kind).toBe('invalid');
  });
});
