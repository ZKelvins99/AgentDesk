import type { AgentEvent, RuntimeId, SessionId, Timestamp } from "@agentdesk/runtime-protocol"

export interface OpenCodeRawEvent {
  readonly type: string
  readonly sessionID?: string
  readonly messageID?: string
  readonly [key: string]: unknown
}

function at(): Timestamp {
  return new Date().toISOString()
}

/**
 * OpenCode Event → AgentEvent（M05-T08）。
 * 只做边界转换；无法识别的原始事件原样透传（Native Event Escape Hatch）。
 */
export function mapOpenCodeEvent(
  raw: OpenCodeRawEvent,
  runtimeId: RuntimeId,
  sessionId?: SessionId,
): AgentEvent {
  const sid = sessionId ?? raw.sessionID ?? "unknown"
  switch (raw.type) {
    case "session.idle":
      return { type: "session.idle", runtimeId, sessionId: sid, at: at() }
    case "session.error":
      return {
        type: "session.error",
        runtimeId,
        sessionId: sid,
        error: { code: "opencode", message: String(raw.error ?? "session error") },
        at: at(),
      }
    case "message.updated": {
      // opencode message.updated 携带完整 message 内容（含增量）
      const text = extractText(raw)
      const messageId = raw.messageID ?? `msg:${at()}`
      if (isMessageDone(raw)) {
        return {
          type: "message.completed",
          runtimeId,
          sessionId: sid,
          messageId,
          text,
          at: at(),
        }
      }
      return {
        type: "message.delta",
        runtimeId,
        sessionId: sid,
        messageId,
        delta: text,
        at: at(),
      }
    }
    case "message.part.updated":
      return {
        type: "message.delta",
        runtimeId,
        sessionId: sid,
        messageId: raw.messageID ?? `msg:${at()}`,
        delta: extractText(raw),
        at: at(),
      }
    case "tool.execution_started":
      return {
        type: "tool.started",
        runtimeId,
        sessionId: sid,
        toolName: String(raw.tool ?? raw.toolName ?? "unknown"),
        callId: raw.callID ? String(raw.callID) : undefined,
        args: raw.input,
        at: at(),
      }
    case "tool.execution_completed":
      return {
        type: "tool.completed",
        runtimeId,
        sessionId: sid,
        toolName: String(raw.tool ?? raw.toolName ?? "unknown"),
        callId: raw.callID ? String(raw.callID) : undefined,
        result: raw.output,
        at: at(),
      }
    case "permission.request":
      return {
        type: "permission.requested",
        runtimeId,
        sessionId: sid,
        action: String(raw.permission ?? raw.action ?? "unknown"),
        detail: raw,
        at: at(),
      }
    default:
      return { type: "native", runtimeId, sessionId: sid, payload: raw, at: at() }
  }
}

function isMessageDone(raw: OpenCodeRawEvent): boolean {
  const message = raw.message as Record<string, unknown> | undefined
  const time = message?.time as Record<string, unknown> | undefined
  return time?.complete === true || raw.done === true || (raw.role === "assistant" && raw.complete === true)
}

function extractText(raw: OpenCodeRawEvent): string {
  const message = raw.message as Record<string, unknown> | undefined
  if (!message) return ""
  const parts = Array.isArray(message.parts) ? message.parts : []
  return parts
    .filter((part): part is Record<string, unknown> => typeof part === "object" && part !== null)
    .filter((part) => part.type === "text" || part.type === "reasoning")
    .map((part) => String(part.text ?? ""))
    .join("")
}