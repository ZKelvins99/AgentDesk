import type { AgentDeskEvent, AgentDeskUsage } from '@agentdesk/ipc';

/**
 * 事件 → 消息模型（README 9.4.2 四类元素：用户/助手/思考/工具卡）。
 * 纯函数便于单测；流式增量更新由 SessionStore 以 16ms 合流批量调用。
 */

export type UiMessage =
  | {
      kind: 'user';
      id: string;
      text: string;
      status: 'sending' | 'sent';
    }
  | {
      kind: 'assistant';
      id: string;
      text: string;
      thinking: string;
      status: 'streaming' | 'done';
      usage?: AgentDeskUsage;
    }
  | {
      kind: 'tool';
      id: string;
      callId: string;
      toolName: string;
      args: unknown;
      status: 'running' | 'ok' | 'error';
      result?: unknown;
      ms?: number;
      output: string;
      expanded: boolean;
    }
  | { kind: 'system'; id: string; text: string; tone: 'info' | 'error' };

export interface SessionUiState {
  id: string;
  title: string;
  workspacePath: string;
  messages: UiMessage[];
  seq: number;
  appliedSeq: number;
  model: string | null;
  status: 'idle' | 'streaming' | 'degraded' | 'error';
  pendingCount: number;
  queueMode: 'steer' | 'followUp' | null;
  lastEventAt: number;
}

let userMsgCounter = 0;

export function createSessionUiState(id: string, workspacePath: string): SessionUiState {
  return {
    id,
    title: '',
    workspacePath,
    messages: [],
    seq: 0,
    appliedSeq: 0,
    model: null,
    status: 'idle',
    pendingCount: 0,
    queueMode: null,
    lastEventAt: 0,
  };
}

export function addUserMessage(state: SessionUiState, text: string): SessionUiState {
  userMsgCounter += 1;
  const msg: UiMessage = {
    kind: 'user',
    id: `u-${Date.now()}-${userMsgCounter}`,
    text,
    status: 'sending',
  };
  return { ...state, messages: [...state.messages, msg] };
}

export function markUserMessageSent(state: SessionUiState, id: string): SessionUiState {
  return updateMessage(state, id, (m) => (m.kind === 'user' ? { ...m, status: 'sent' } : m));
}

export function applyEvent(state: SessionUiState, ev: AgentDeskEvent): SessionUiState {
  switch (ev.k) {
    case 'session.state': {
      const next: SessionUiState = {
        ...state,
        model: ev.state.model,
        pendingCount: ev.state.pendingMessageCount,
        title: ev.state.sessionName ?? state.title,
        status: ev.state.isStreaming ? 'streaming' : state.status === 'error' ? 'error' : 'idle',
      };
      return next;
    }
    case 'turn.start':
      return { ...state, status: 'streaming' };
    case 'turn.end':
      return { ...state };
    case 'msg.start': {
      const msg: UiMessage = {
        kind: 'assistant',
        id: ev.msgId,
        text: '',
        thinking: '',
        status: 'streaming',
      };
      return { ...state, messages: [...state.messages, msg] };
    }
    case 'msg.delta':
      return updateMessage(state, ev.msgId, (m) => {
        if (m.kind !== 'assistant') return m;
        if (ev.part.t === 'text') return { ...m, text: m.text + ev.part.v };
        return { ...m, thinking: m.thinking + ev.part.v };
      });
    case 'msg.end':
      return updateMessage(state, ev.msgId, (m) =>
        m.kind === 'assistant'
          ? {
              ...m,
              status: 'done',
              ...(ev.usage !== undefined ? { usage: ev.usage } : {}),
            }
          : m,
      );
    case 'tool.start': {
      const msg: UiMessage = {
        kind: 'tool',
        id: `tool-${ev.callId}`,
        callId: ev.callId,
        toolName: ev.name,
        args: ev.args,
        status: 'running',
        output: '',
        expanded: false,
      };
      return { ...state, messages: [...state.messages, msg] };
    }
    case 'tool.progress':
      return state;
    case 'tool.end':
      return updateMessage(state, `tool-${ev.callId}`, (m) =>
        m.kind === 'tool'
          ? {
              ...m,
              status: ev.ok ? 'ok' : 'error',
              result: ev.result,
              ms: ev.ms,
            }
          : m,
      );
    case 'bash.output':
      return updateLastRunningTool(state, (m) => ({ ...m, output: m.output + ev.chunk }));
    case 'queue':
      return { ...state, pendingCount: ev.pending, queueMode: ev.mode };
    case 'agent.settled':
      return { ...state, status: 'idle', pendingCount: 0, queueMode: null };
    case 'compact.start':
    case 'compact.end':
      return { ...state, status: 'streaming' };
    case 'retry':
      return state;
    case 'error': {
      const msg: UiMessage = {
        kind: 'system',
        id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: ev.message,
        tone: 'error',
      };
      return { ...state, messages: [...state.messages, msg], status: 'error' };
    }
    case 'ui.request':
      return state;
    default:
      return state;
  }
}

function updateMessage(
  state: SessionUiState,
  id: string,
  updater: (msg: UiMessage) => UiMessage,
): SessionUiState {
  const idx = state.messages.findIndex((m) => m.id === id);
  if (idx === -1) return state;
  const messages = [...state.messages];
  const current = messages[idx];
  if (!current) return state;
  messages[idx] = updater(current);
  return { ...state, messages };
}

function updateLastRunningTool(
  state: SessionUiState,
  updater: (msg: Extract<UiMessage, { kind: 'tool' }>) => Extract<UiMessage, { kind: 'tool' }>,
): SessionUiState {
  const idx = state.messages.findLastIndex((m) => m.kind === 'tool');
  if (idx === -1) return state;
  const messages = [...state.messages];
  const current = messages[idx];
  if (current?.kind !== 'tool') return state;
  messages[idx] = updater(current);
  return { ...state, messages };
}
