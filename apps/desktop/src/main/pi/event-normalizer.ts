import type { PiEvent, PiMessage } from '@agentdesk/pi-protocol';
import type { AgentDeskEvent, AgentDeskUsage } from './agentdesk-events';

let turnCounter = 0;
let msgCounter = 0;

/**
 * pi 事件 → AgentDeskEvent（README 8.1.4）。
 * - message_update 的 delta 合并为 msg.delta（text/thinking）
 * - tool_execution_start/update/end 折叠成一个 ToolCall 生命周期
 * - 原始事件保留在 sidecar 的 raw-event 通道（开发者模式调试用）
 */
export function normalizePiEvent(event: PiEvent): AgentDeskEvent[] {
  switch (event.type) {
    case 'agent_settled':
      return [{ k: 'agent.settled' }];

    case 'turn_start': {
      turnCounter += 1;
      return [{ k: 'turn.start', turnId: `t${turnCounter}` }];
    }

    case 'turn_end': {
      return [{ k: 'turn.end', turnId: `t${turnCounter}` }];
    }

    case 'message_start': {
      msgCounter += 1;
      const msgId = messageId(event.message, msgCounter);
      return [{ k: 'msg.start', msgId, role: 'assistant' }];
    }

    case 'message_update': {
      const msgId = messageId(event.message, msgCounter);
      const delta = event.assistantMessageEvent;
      if (delta.type === 'text_delta') {
        return [{ k: 'msg.delta', msgId, part: { t: 'text', v: delta.delta } }];
      }
      if (delta.type === 'thinking_delta') {
        return [{ k: 'msg.delta', msgId, part: { t: 'thinking', v: delta.delta } }];
      }
      return [];
    }

    case 'message_end': {
      const msgId = messageId(event.message, msgCounter);
      const usage = usageOf(event.message);
      return [{ k: 'msg.end', msgId, ...(usage ? { usage } : {}) }];
    }

    case 'tool_execution_start':
      return [
        { k: 'tool.start', callId: event.toolCallId, name: event.toolName, args: event.args },
      ];

    case 'tool_execution_update':
      return [
        {
          k: 'tool.progress',
          callId: event.toolCallId,
          patch: event.partialResult ?? null,
        },
      ];

    case 'tool_execution_end':
      return [
        {
          k: 'tool.end',
          callId: event.toolCallId,
          ok: !(event.isError ?? false),
          result: event.result ?? null,
          ms: 0,
        },
      ];

    case 'bash_execution_update':
      return [{ k: 'bash.output', cmdId: event.id ?? '', chunk: event.delta }];

    case 'queue_update': {
      const steering = event.steering ?? [];
      const followUp = event.followUp ?? [];
      return [
        {
          k: 'queue',
          pending: steering.length + followUp.length,
          mode: steering.length > 0 ? 'steer' : 'followUp',
        },
      ];
    }

    case 'compaction_start':
      return [{ k: 'compact.start' }];

    case 'compaction_end': {
      const result = event.result as
        | { tokensBefore?: number; estimatedTokensAfter?: number }
        | null
        | undefined;
      const compactEnd: Extract<AgentDeskEvent, { k: 'compact.start' | 'compact.end' }> = {
        k: 'compact.end',
      };
      if (result?.tokensBefore !== undefined) compactEnd.before = result.tokensBefore;
      if (result?.estimatedTokensAfter !== undefined)
        compactEnd.after = result.estimatedTokensAfter;
      return [compactEnd];
    }

    case 'auto_retry_start': {
      const retryStart: Extract<AgentDeskEvent, { k: 'retry' }> = {
        k: 'retry',
        phase: 'start',
        attempt: event.attempt,
      };
      if (event.delayMs !== undefined) retryStart.delayMs = event.delayMs;
      return [retryStart];
    }

    case 'auto_retry_end':
      return [{ k: 'retry', phase: 'end', attempt: event.attempt ?? 0 }];

    case 'extension_error':
      return [
        {
          k: 'error',
          scope: 'extension',
          message: event.error,
          detail: { extensionPath: event.extensionPath, event: event.event },
        },
      ];

    case 'extension_ui_request':
      return [
        {
          k: 'ui.request',
          reqId: event.id,
          kind: event.method,
          payload: Object.fromEntries(
            Object.entries(event).filter(([key]) => !['type', 'id', 'method'].includes(key)),
          ),
        },
      ];

    default:
      // agent_start / agent_end / message 的中间态不产生 UI 事件
      return [];
  }
}

function messageId(message: unknown, fallback: number): string {
  const m = message as PiMessage | undefined;
  if (m?.timestamp) return `m-${m.timestamp}`;
  return `m-${fallback}`;
}

function usageOf(message: unknown): AgentDeskUsage | undefined {
  const m = message as PiMessage | undefined;
  const usage = m?.usage;
  if (!usage) return undefined;
  const costUsd =
    usage.cost?.total !== undefined
      ? usage.cost.total
      : usage.cost
        ? usage.cost.input + usage.cost.output + usage.cost.cacheRead + usage.cost.cacheWrite
        : undefined;
  return {
    ...(usage.input !== undefined ? { input: usage.input } : {}),
    ...(usage.output !== undefined ? { output: usage.output } : {}),
    ...(usage.cacheRead !== undefined ? { cacheRead: usage.cacheRead } : {}),
    ...(usage.cacheWrite !== undefined ? { cacheWrite: usage.cacheWrite } : {}),
    ...(costUsd !== undefined ? { costUsd } : {}),
  };
}
