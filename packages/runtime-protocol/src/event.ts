import type { ArtifactRef } from "./artifact.ts"
import type { SessionId, Timestamp, RuntimeId } from "./types.ts"
import type { SessionError } from "./session.ts"

/**
 * 统一 AgentEvent（文档第 8 节）。
 * UI / Broker / Reducer 只消费该 union，不感知 Runtime 内部事件格式。
 */
export type AgentEvent =
  | { readonly type: "session.created"; readonly runtimeId: RuntimeId; readonly sessionId: SessionId; readonly at: Timestamp }
  | { readonly type: "session.resumed"; readonly runtimeId: RuntimeId; readonly sessionId: SessionId; readonly at: Timestamp }
  | { readonly type: "message.started"; readonly runtimeId: RuntimeId; readonly sessionId: SessionId; readonly messageId: string; readonly at: Timestamp }
  | { readonly type: "message.delta"; readonly runtimeId: RuntimeId; readonly sessionId: SessionId; readonly messageId: string; readonly delta: string; readonly at: Timestamp }
  | { readonly type: "message.completed"; readonly runtimeId: RuntimeId; readonly sessionId: SessionId; readonly messageId: string; readonly text: string; readonly at: Timestamp }  | { readonly type: "thinking.delta"; readonly runtimeId: RuntimeId; readonly sessionId: SessionId; readonly messageId: string; readonly delta: string; readonly at: Timestamp }
  | { readonly type: "tool.started"; readonly runtimeId: RuntimeId; readonly sessionId: SessionId; readonly toolName: string; readonly callId?: string; readonly args?: unknown; readonly at: Timestamp }  | { readonly type: "tool.update"; readonly runtimeId: RuntimeId; readonly sessionId: SessionId; readonly toolName: string; readonly callId?: string; readonly update?: unknown; readonly at: Timestamp }
  | { readonly type: "tool.completed"; readonly runtimeId: RuntimeId; readonly sessionId: SessionId; readonly toolName: string; readonly callId?: string; readonly result?: unknown; readonly error?: string; readonly at: Timestamp }  | { readonly type: "tool.failed"; readonly runtimeId: RuntimeId; readonly sessionId: SessionId; readonly toolName: string; readonly callId?: string; readonly error: string; readonly at: Timestamp }
  | { readonly type: "permission.request"; readonly runtimeId: RuntimeId; readonly sessionId: SessionId; readonly action: string; readonly detail?: unknown; readonly at: Timestamp }
  | { readonly type: "permission.resolved"; readonly runtimeId: RuntimeId; readonly sessionId: SessionId; readonly action: string; readonly decision: "allow" | "deny" | "escalate"; readonly at: Timestamp }
  | { readonly type: "artifact.emitted"; readonly runtimeId: RuntimeId; readonly sessionId: SessionId; readonly artifact: ArtifactRef; readonly at: Timestamp }  | { readonly type: "status"; readonly runtimeId: RuntimeId; readonly sessionId?: SessionId; readonly status: string; readonly detail?: unknown; readonly at: Timestamp }
  | { readonly type: "error"; readonly runtimeId: RuntimeId; readonly sessionId?: SessionId; readonly code: string; readonly message: string; readonly recoverable: boolean; readonly at: Timestamp }
  | { readonly type: "session.idle"; readonly runtimeId: RuntimeId; readonly sessionId: SessionId; readonly at: Timestamp }
  | { readonly type: "session.error"; readonly runtimeId: RuntimeId; readonly sessionId: SessionId; readonly error: SessionError; readonly at: Timestamp }
  | { readonly type: "session.ended"; readonly runtimeId: RuntimeId; readonly sessionId: SessionId; readonly at: Timestamp }
  /** M08: Pi Extension UI Bridge —— 原生 UI 交互请求（confirm/select/input/notify 等） */
  | {
      readonly type: "ui.request"
      readonly runtimeId: RuntimeId
      readonly sessionId: SessionId
      readonly requestId: string
      readonly method: "confirm" | "select" | "input" | "notify" | "status" | string
      readonly title?: string
      readonly message?: string
      readonly options?: readonly string[]
      readonly placeholder?: string
      readonly detail?: unknown
      readonly at: Timestamp
    }
  | { readonly type: "heartbeat"; readonly runtimeId: RuntimeId; readonly at: Timestamp }
  /** Native Event Escape Hatch（文档 8.3）：不认识的原始事件原样透传 */
  | { readonly type: "native"; readonly runtimeId: RuntimeId; readonly sessionId?: SessionId; readonly payload: unknown; readonly at: Timestamp }

export function eventSessionId(event: AgentEvent): SessionId | undefined {
  return "sessionId" in event ? event.sessionId : undefined
}
