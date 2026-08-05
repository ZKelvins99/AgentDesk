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

function sid(raw: OpenCodeRawEvent, fallback?: SessionId): SessionId {
  return raw.sessionID ?? fallback ?? "unknown"
}

function messageId(raw: OpenCodeRawEvent): string {
  return String(raw.assistantMessageID ?? raw.messageID ?? `msg:${at()}`)
}

function toolName(raw: OpenCodeRawEvent): string {
  return String(raw.tool ?? raw.name ?? raw.toolName ?? "unknown")
}

function callId(raw: OpenCodeRawEvent): string | undefined {
  return raw.callID ? String(raw.callID) : undefined
}

/**
 * M05-T03..T06: OpenCode Event -> AgentEvent mapper.
 * Supports both the new `session.next.*` stream events and legacy
 * `message.updated` / `tool.execution_*` events. Reasoning fragments are
 * mapped to `thinking.delta` so the UI can render thinking separately.
 */
export function mapOpenCodeEvent(
  raw: OpenCodeRawEvent,
  runtimeId: RuntimeId,
  sessionId?: SessionId,
): AgentEvent {
  const s = sid(raw, sessionId)
  switch (raw.type) {
    // ---- new stream events: text ----
    case "session.next.text.started":
      return { type: "message.started", runtimeId, sessionId: s, messageId: messageId(raw), at: at() }
    case "session.next.text.delta":
      return {
        type: "message.delta",
        runtimeId,
        sessionId: s,
        messageId: messageId(raw),
        delta: String(raw.delta ?? ""),
        at: at(),
      }
    case "session.next.text.ended":
      return {
        type: "message.completed",
        runtimeId,
        sessionId: s,
        messageId: messageId(raw),
        text: String(raw.text ?? ""),
        at: at(),
      }
    // ---- new stream events: reasoning -> thinking.delta ----
    case "session.next.reasoning.started":
      return { type: "thinking.delta", runtimeId, sessionId: s, messageId: messageId(raw), delta: "", at: at() }
    case "session.next.reasoning.delta":
      return {
        type: "thinking.delta",
        runtimeId,
        sessionId: s,
        messageId: messageId(raw),
        delta: String(raw.delta ?? ""),
        at: at(),
      }
    // ---- new stream events: tool ----
    case "session.next.tool.input.started":
      return {
        type: "tool.started",
        runtimeId,
        sessionId: s,
        toolName: toolName(raw),
        callId: callId(raw),
        args: raw.input,
        at: at(),
      }
    case "session.next.tool.called":
      return {
        type: "tool.update",
        runtimeId,
        sessionId: s,
        toolName: toolName(raw),
        callId: callId(raw),
        update: { input: raw.input, provider: raw.provider },
        at: at(),
      }
    case "session.next.tool.progress":
      return {
        type: "tool.update",
        runtimeId,
        sessionId: s,
        toolName: toolName(raw),
        callId: callId(raw),
        update: { structured: raw.structured, content: raw.content },
        at: at(),
      }
    case "session.next.tool.success":
      return {
        type: "tool.completed",
        runtimeId,
        sessionId: s,
        toolName: toolName(raw),
        callId: callId(raw),
        result: { structured: raw.structured, content: raw.content, result: raw.result },
        at: at(),
      }
    case "session.next.tool.failed":
      return {
        type: "tool.failed",
        runtimeId,
        sessionId: s,
        toolName: toolName(raw),
        callId: callId(raw),
        error: errorText(raw),
        at: at(),
      }
    // ---- new stream events: permission ----
    case "permission.v2.asked":
      return {
        type: "permission.request",
        runtimeId,
        sessionId: s,
        action: String(raw.permission ?? raw.action ?? "unknown"),
        detail: raw,
        at: at(),
      }
    case "permission.v2.replied": {
      const reply = String(raw.reply ?? "")
      return {
        type: "permission.resolved",
        runtimeId,
        sessionId: s,
        action: String(raw.action ?? raw.permission ?? "unknown"),
        decision: reply === "reject" ? "deny" : "allow",
        at: at(),
      }
    }
    // ---- new stream events: step / status ----
    case "session.next.step.failed":
      return {
        type: "error",
        runtimeId,
        sessionId: s,
        code: "opencode.step.failed",
        message: errorText(raw),
        recoverable: true,
        at: at(),
      }
    case "session.status":
      return {
        type: "status",
        runtimeId,
        sessionId: s,
        status: String(raw.status ?? "unknown"),
        detail: raw,
        at: at(),
      }
    case "session.idle":
      return { type: "session.idle", runtimeId, sessionId: s, at: at() }
    case "session.error":
      return {
        type: "session.error",
        runtimeId,
        sessionId: s,
        error: { code: "opencode", message: errorText(raw) },
        at: at(),
      }
    // ---- legacy events ----
    case "message.updated": {
      const messageId_ = messageId(raw)
      if (isMessageDone(raw)) {
        return {
          type: "message.completed",
          runtimeId,
          sessionId: s,
          messageId: messageId_,
          text: extractText(raw),
          at: at(),
        }
      }
      const reasoning = extractReasoning(raw)
      if (reasoning) {
        return {
          type: "thinking.delta",
          runtimeId,
          sessionId: s,
          messageId: messageId_,
          delta: reasoning,
          at: at(),
        }
      }
      return {
        type: "message.delta",
        runtimeId,
        sessionId: s,
        messageId: messageId_,
        delta: extractText(raw),
        at: at(),
      }
    }
    case "message.part.updated": {
      const part = raw.part as Record<string, unknown> | undefined
      const messageId_ = messageId(raw)
      if (part?.type === "reasoning") {
        return {
          type: "thinking.delta",
          runtimeId,
          sessionId: s,
          messageId: messageId_,
          delta: String(part.text ?? ""),
          at: at(),
        }
      }
      return {
        type: "message.delta",
        runtimeId,
        sessionId: s,
        messageId: messageId_,
        delta: extractText(raw),
        at: at(),
      }
    }
    case "tool.execution_started":
      return {
        type: "tool.started",
        runtimeId,
        sessionId: s,
        toolName: toolName(raw),
        callId: callId(raw),
        args: raw.input,
        at: at(),
      }
    case "tool.execution_completed":
      return {
        type: "tool.completed",
        runtimeId,
        sessionId: s,
        toolName: toolName(raw),
        callId: callId(raw),
        result: raw.output,
        at: at(),
      }
    case "permission.request":
      return {
        type: "permission.request",
        runtimeId,
        sessionId: s,
        action: String(raw.permission ?? raw.action ?? "unknown"),
        detail: raw,
        at: at(),
      }
    default:
      return { type: "native", runtimeId, sessionId: s, payload: raw, at: at() }
  }
}

function isMessageDone(raw: OpenCodeRawEvent): boolean {
  const message = raw.message as Record<string, unknown> | undefined
  const time = message?.time as Record<string, unknown> | undefined
  return time?.complete === true || raw.done === true || (raw.role === "assistant" && raw.complete === true)
}

function errorText(raw: OpenCodeRawEvent): string {
  const error = raw.error as Record<string, unknown> | string | undefined
  if (typeof error === "string") return error
  if (error && typeof error === "object") {
    return String(error.message ?? JSON.stringify(error))
  }
  return String(raw.message ?? "opencode error")
}

function extractText(raw: OpenCodeRawEvent): string {
  return extractParts(raw, (part) => part.type === "text")
}

function extractReasoning(raw: OpenCodeRawEvent): string {
  return extractParts(raw, (part) => part.type === "reasoning")
}

function extractParts(raw: OpenCodeRawEvent, predicate: (part: Record<string, unknown>) => boolean): string {
  const message = raw.message as Record<string, unknown> | undefined
  if (!message) return ""
  const parts = Array.isArray(message.parts) ? message.parts : []
  return parts
    .filter((part): part is Record<string, unknown> => typeof part === "object" && part !== null)
    .filter(predicate)
    .map((part) => String(part.text ?? ""))
    .join("")
}