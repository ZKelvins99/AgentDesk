/**
 * AgentDesk 事件归一化契约（README 8.1.4）。
 * 渲染层只消费这里定义的事件，不直接接触 pi 原始事件。
 */

export type UiRequestKind =
  | 'select'
  | 'confirm'
  | 'input'
  | 'editor'
  | 'notify'
  | 'setStatus'
  | 'setWidget'
  | 'setTitle'
  | 'set_editor_text';

export interface AgentDeskUsage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  costUsd?: number;
}

export type AgentDeskEvent =
  | { k: 'session.state'; state: SessionState }
  | { k: 'turn.start' | 'turn.end'; turnId: string }
  | { k: 'msg.start'; msgId: string; role: 'assistant' }
  | {
      k: 'msg.delta';
      msgId: string;
      part: { t: 'text'; v: string } | { t: 'thinking'; v: string };
    }
  | { k: 'msg.end'; msgId: string; usage?: AgentDeskUsage }
  | { k: 'tool.start'; callId: string; name: string; args: unknown }
  | { k: 'tool.progress'; callId: string; patch: unknown }
  | { k: 'tool.end'; callId: string; ok: boolean; result: unknown; ms: number }
  | { k: 'bash.output'; cmdId: string; chunk: string }
  | { k: 'queue'; pending: number; mode: 'steer' | 'followUp' }
  | { k: 'compact.start' | 'compact.end'; before?: number; after?: number }
  | { k: 'retry'; phase: 'start' | 'end'; attempt: number; delayMs?: number }
  | { k: 'agent.settled' }
  | { k: 'ui.request'; reqId: string; kind: UiRequestKind; payload: unknown }
  | { k: 'error'; scope: 'extension' | 'sidecar' | 'provider'; message: string; detail?: unknown };

/** get_state 快照（会话状态）。 */
export interface SessionState {
  model: string | null;
  thinkingLevel: string | null;
  isStreaming: boolean;
  isCompacting: boolean;
  steeringMode: string;
  followUpMode: string;
  sessionFile?: string;
  sessionId?: string;
  sessionName?: string;
  autoCompactionEnabled: boolean;
  messageCount: number;
  pendingMessageCount: number;
}
