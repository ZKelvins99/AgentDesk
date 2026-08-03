import type { SessionId, Timestamp } from "./types.ts"

export type SessionState = "created" | "running" | "idle" | "closed" | "error"

export interface SessionError {
  readonly code: string
  readonly message: string
}

/** 平台侧 Session 引用；原生 session 由 Runtime 自己拥有（文档第 9 节） */
export interface RuntimeSessionRef {
  readonly sessionId: SessionId
  readonly runtimeId: string
  /** Runtime 原生 session id（例如 opencode session id / pi 真实 id） */
  readonly nativeSessionId?: string
  readonly state: SessionState
  readonly createdAt: Timestamp
  readonly updatedAt: Timestamp
  readonly title?: string
  readonly cwd?: string
  readonly error?: SessionError
}