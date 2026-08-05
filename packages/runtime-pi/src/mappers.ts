import type { AgentEvent, RuntimeId, SessionId, Timestamp } from "@agentdesk/runtime-protocol"

/** pi-web /api/agent/[id]/events SSE 原始事件（pi-web lib/rpc-manager AgentEvent 形态） */
export interface PiWebRawEvent {
  readonly type: string
  readonly sessionId?: string
  readonly [key: string]: unknown
}

function at(): Timestamp {
  return new Date().toISOString()
}

/**
 * Pi（pi-web SSE）Event → AgentEvent（M06-T10）。
 * pi-web 已按客户端需要精简事件：message_update / agent_end / tool_execution_* 等。
 */
export function mapPiWebEvent(
  raw: PiWebRawEvent,
  runtimeId: RuntimeId,
  sessionId?: SessionId,
): AgentEvent | null {
  const sid = sessionId ?? raw.sessionId ?? "unknown"
  switch (raw.type) {
    case "connected":
      // pi-web 连接握手事件，不映射
      return null
    case "agent_start":
      return { type: "message.started", runtimeId, sessionId: sid, messageId: `pi:${at()}`, at: at() }
    case "message_update": {
      const text = extractPiText(raw)
      return {
        type: "message.delta",
        runtimeId,
        sessionId: sid,
        messageId: raw.messageId ? String(raw.messageId) : `pi:${at()}`,
        delta: text,
        at: at(),
      }
    }
    case "tool_execution_start":
      return {
        type: "tool.started",
        runtimeId,
        sessionId: sid,
        toolName: String(raw.toolName ?? raw.tool ?? "unknown"),
        callId: raw.callId ? String(raw.callId) : undefined,
        args: raw.args,
        at: at(),
      }
    case "tool_execution_end":
      return {
        type: "tool.completed",
        runtimeId,
        sessionId: sid,
        toolName: String(raw.toolName ?? raw.tool ?? "unknown"),
        callId: raw.callId ? String(raw.callId) : undefined,
        result: raw.result,
        error: raw.error ? String(raw.error) : undefined,
        at: at(),
      }
    case "agent_end":
      return { type: "session.idle", runtimeId, sessionId: sid, at: at() }
    case "agent_settled":
      return { type: "session.idle", runtimeId, sessionId: sid, at: at() }
    case "extension_ui_request": {
      // M08: Pi Extension UI Bridge —— confirm/select/input/notify/status 统一映射
      const method = String(raw.method ?? "unknown")
      const id = raw.id ? String(raw.id) : `pi-ui:${at()}`
      return {
        type: "ui.request",
        runtimeId,
        sessionId: sid,
        requestId: id,
        method,
        title: raw.title ? String(raw.title) : undefined,
        message: raw.message ? String(raw.message) : undefined,
        options: Array.isArray(raw.options) ? (raw.options as unknown[]).map(String) : undefined,
        placeholder: raw.placeholder ? String(raw.placeholder) : undefined,
        detail: raw as unknown,
        at: at(),
      }
    }
    case "session_error":
    case "error":
      return {
        type: "session.error",
        runtimeId,
        sessionId: sid,
        error: { code: "pi", message: String(raw.message ?? raw.error ?? "pi error") },
        at: at(),
      }
    default:
      // Native Event Escape Hatch：未知事件原样透传
      return { type: "native", runtimeId, sessionId: sid, payload: raw, at: at() }
  }
}

function extractPiText(raw: PiWebRawEvent): string {
  // pi-web message_update 形态多样：text / content / delta / assistantMessageEvent
  for (const key of ["delta", "text", "content"]) {
    const value = raw[key]
    if (typeof value === "string" && value.length > 0) return value
  }
  // pi-web removes assistantMessageEvent, keeps message (AgentMessage.content)
  const agentMessage = raw.message as { content?: unknown[] } | undefined
  if (agentMessage && Array.isArray(agentMessage.content)) {
    const text = agentMessage.content
      .filter((part): part is { type: string; text?: string } => typeof part === "object" && part !== null)
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text ?? "")
      .join("")
    if (text.length > 0) return text
  }
  const assistant = raw.assistantMessageEvent as Record<string, unknown> | undefined
  if (assistant) {
    const parts = Array.isArray(assistant.parts) ? assistant.parts : []
    return parts
      .filter((part): part is Record<string, unknown> => typeof part === "object" && part !== null)
      .filter((part) => part.type === "text")
      .map((part) => String(part.text ?? ""))
      .join("")
  }
  return ""
}
