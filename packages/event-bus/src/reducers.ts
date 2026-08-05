import type { AgentEvent, ArtifactRef, SessionId, SessionError } from "@agentdesk/runtime-protocol"

/** 消息流 reducer（M04-T02） */
export interface MessageState {
  readonly messageId: string
  readonly sessionId: SessionId
  readonly text: string
  readonly status: "idle" | "streaming" | "done" | "error"
}

export type MessageStateMap = ReadonlyMap<SessionId, MessageState>

export function messageReducer(
  state: MessageStateMap,
  event: AgentEvent,
): MessageStateMap {
  const next = new Map(state)
  switch (event.type) {
    case "message.started": {
      const key = event.sessionId
      next.set(key, { messageId: event.messageId, sessionId: key, text: "", status: "streaming" })
      break
    }
    case "message.delta": {
      const prev = state.get(event.sessionId)
      const base = prev ?? { messageId: event.messageId, sessionId: event.sessionId, text: "", status: "streaming" as const }
      next.set(event.sessionId, { ...base, text: base.text + event.delta, status: "streaming" })
      break
    }
    case "message.completed": {
      const prev = state.get(event.sessionId)
      next.set(event.sessionId, {
        messageId: event.messageId,
        sessionId: event.sessionId,
        text: event.text,
        status: "done",
        ...(prev ? {} : {}),
      })
      break
    }
    case "session.error": {
      const prev = state.get(event.sessionId)
      if (prev) next.set(event.sessionId, { ...prev, status: "error" })
      break
    }
    default:
      break
  }
  return next
}

/** Tool 生命周期 reducer（M04-T03） */
export interface ToolCallState {
  readonly callId: string
  readonly toolName: string
  readonly sessionId: SessionId
  readonly status: "running" | "done" | "error"
  readonly args?: unknown
  readonly result?: unknown
  readonly error?: string
}

export type ToolStateMap = ReadonlyMap<string, ToolCallState>

export function toolLifecycleReducer(
  state: ToolStateMap,
  event: AgentEvent,
): ToolStateMap {
  const next = new Map(state)
  switch (event.type) {
    case "tool.started": {
      const callId = event.callId ?? `${event.toolName}:${event.at}`
      next.set(callId, { callId, toolName: event.toolName, sessionId: event.sessionId, status: "running", args: event.args })
      break
    }
    case "tool.completed": {
      const callId = event.callId ?? `${event.toolName}:${event.at}`
      const prev = state.get(callId)
      if (!prev) break
      next.set(callId, {
        ...prev,
        status: event.error ? "error" : "done",
        result: event.result,
        error: event.error,
      })
      break
    }
    default:
      break
  }
  return next
}

/** Permission reducer（M04-T04） */
export interface PermissionState {
  readonly action: string
  readonly sessionId: SessionId
  readonly status: "pending" | "allow" | "deny" | "escalate"
}

export function permissionReducer(
  state: ReadonlyMap<string, PermissionState>,
  event: AgentEvent,
): ReadonlyMap<string, PermissionState> {
  const next = new Map(state)
  switch (event.type) {
    case "permission.request": {
      const key = `${event.sessionId}:${event.action}`
      next.set(key, { action: event.action, sessionId: event.sessionId, status: "pending" })
      break
    }
    case "permission.resolved": {
      const key = `${event.sessionId}:${event.action}`
      const prev = state.get(key)
      if (prev) next.set(key, { ...prev, status: event.decision })
      break
    }
    default:
      break
  }
  return next
}

/** Artifact reducer（M04-T05） */
export function artifactReducer(
  state: readonly ArtifactRef[],
  event: AgentEvent,
): readonly ArtifactRef[] {
  if (event.type !== "artifact.emitted") return state
  return [...state, event.artifact]
}

/** 错误归一化（M04-T06） */
export function normalizeError(error: unknown): SessionError {
  if (error instanceof Error) {
    return { code: "error", message: error.message }
  }
  if (typeof error === "string") return { code: "error", message: error }
  if (isRecord(error) && typeof error.message === "string") {
    return { code: typeof error.code === "string" ? error.code : "error", message: error.message }
  }
  return { code: "error", message: "Unknown error" }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}