import { describe, expect, it } from 'vitest';
import {
  addUserMessage,
  applyEvent,
  createSessionUiState,
  markUserMessageSent,
} from './message-model';

function fresh() {
  return createSessionUiState('s1', '/work');
}

describe('message-model（README 9.4.2）', () => {
  it('用户消息：本地回声 sending → sent', () => {
    let s = fresh();
    s = addUserMessage(s, '你好');
    const user = s.messages[s.messages.length - 1];
    expect(user).toMatchObject({ kind: 'user', text: '你好', status: 'sending' });
    s = markUserMessageSent(s, (user as { id: string }).id);
    expect(s.messages[s.messages.length - 1]).toMatchObject({ kind: 'user', status: 'sent' });
  });

  it('助手消息：msg.start → delta 流式追加（text + thinking）→ msg.end', () => {
    let s = fresh();
    s = applyEvent(s, { k: 'turn.start', turnId: 't1' });
    s = applyEvent(s, { k: 'msg.start', msgId: 'm1', role: 'assistant' });
    s = applyEvent(s, { k: 'msg.delta', msgId: 'm1', part: { t: 'thinking', v: '想' } });
    s = applyEvent(s, { k: 'msg.delta', msgId: 'm1', part: { t: 'text', v: '你' } });
    s = applyEvent(s, { k: 'msg.delta', msgId: 'm1', part: { t: 'text', v: '好' } });
    s = applyEvent(s, { k: 'msg.end', msgId: 'm1', usage: { input: 2, output: 2 } });
    const msg = s.messages[0];
    expect(msg).toMatchObject({
      kind: 'assistant',
      text: '你好',
      thinking: '想',
      status: 'done',
    });
    expect(s.status).toBe('streaming');
  });

  it('工具卡：tool.start → bash.output → tool.end', () => {
    let s = fresh();
    s = applyEvent(s, {
      k: 'tool.start',
      callId: 'c1',
      name: 'bash',
      args: { command: 'ls' },
    });
    s = applyEvent(s, { k: 'bash.output', cmdId: 'b1', chunk: 'a.ts\n' });
    s = applyEvent(s, { k: 'bash.output', cmdId: 'b1', chunk: 'b.ts\n' });
    s = applyEvent(s, { k: 'tool.end', callId: 'c1', ok: true, result: 'ok', ms: 12 });
    const tool = s.messages[0];
    expect(tool).toMatchObject({
      kind: 'tool',
      toolName: 'bash',
      status: 'ok',
      output: 'a.ts\nb.ts\n',
      ms: 12,
    });
  });

  it('queue / agent.settled 驱动队列徽标与状态', () => {
    let s = fresh();
    s = applyEvent(s, { k: 'queue', pending: 2, mode: 'followUp' });
    expect(s.pendingCount).toBe(2);
    expect(s.queueMode).toBe('followUp');
    s = applyEvent(s, { k: 'agent.settled' });
    expect(s.status).toBe('idle');
    expect(s.pendingCount).toBe(0);
  });

  it('error 事件推入系统错误消息并置 error 状态', () => {
    let s = fresh();
    s = applyEvent(s, { k: 'error', scope: 'sidecar', message: '内核崩溃' });
    expect(s.status).toBe('error');
    expect(s.messages[s.messages.length - 1]).toMatchObject({
      kind: 'system',
      tone: 'error',
      text: '内核崩溃',
    });
  });

  it('session.state 更新模型/流式状态/标题', () => {
    let s = fresh();
    s = applyEvent(s, {
      k: 'session.state',
      state: {
        model: 'mock-model',
        thinkingLevel: 'off',
        isStreaming: true,
        isCompacting: false,
        steeringMode: 'all',
        followUpMode: 'all',
        autoCompactionEnabled: true,
        approvalMode: 'full-access',
        messageCount: 3,
        pendingMessageCount: 0,
        sessionName: '测试会话',
      },
    });
    expect(s.model).toBe('mock-model');
    expect(s.status).toBe('streaming');
    expect(s.title).toBe('测试会话');
  });
});
