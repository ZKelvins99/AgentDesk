import { randomUUID } from "node:crypto"
import type {
  AgentCapabilities,
  AgentEvent,
  AgentRuntime,
  CreateSessionInput,
  HealthStatus,
  RuntimeSessionRef,
  SendInput,
  SessionId,
  Timestamp,
  Unsubscribe,
} from "@agentdesk/runtime-protocol"
import { createRuntimeManifest } from "./manifest.ts"

const now = (): Timestamp => new Date().toISOString()

/**
 * M22-T01: Third-party Runtime 基类 —— 第三方只需实现 4 个方法：
 * runTurn / doCancel / doHealth / capabilities。
 * Session 管理、事件订阅、流式转发由基类提供。
 */
export abstract class BaseRuntime implements AgentRuntime {
  abstract readonly id: string
  abstract readonly displayName: string

  private readonly listeners = new Set<(event: AgentEvent) => void>()
  protected disposed = false

  abstract capabilities(): AgentCapabilities

  get manifest() {
    return createRuntimeManifest({
      id: this.id,
      displayName: this.displayName,
      capabilities: this.capabilities(),
    })
  }

  async init(): Promise<void> {
    this.disposed = false
  }

  async dispose(): Promise<void> {
    this.disposed = true
    this.listeners.clear()
  }

  abstract doHealth(): Promise<{ ok: boolean; detail?: string }>

  async health(): Promise<HealthStatus> {
    const result = await this.doHealth()
    return {
      ok: result.ok,
      runtimeId: this.id,
      detail: result.detail,
      checkedAt: now(),
    }
  }

  async createSession(input?: CreateSessionInput): Promise<RuntimeSessionRef> {
    const sessionId = `${this.id}:${randomUUID()}`
    this.emit({ type: "session.created", runtimeId: this.id, sessionId, at: now() })
    const ref: RuntimeSessionRef = {
      sessionId,
      runtimeId: this.id,
      nativeSessionId: sessionId,
      state: "created",
      createdAt: now(),
      updatedAt: now(),
      cwd: input?.cwd ?? input?.directory,
      title: input?.title,
    }
    if (input?.initialMessage) {
      void this.runTurn(sessionId, input.initialMessage)
    }
    return ref
  }

  async resumeSession(sessionId: SessionId): Promise<RuntimeSessionRef> {
    this.emit({ type: "session.resumed", runtimeId: this.id, sessionId, at: now() })
    return {
      sessionId,
      runtimeId: this.id,
      nativeSessionId: sessionId,
      state: "created",
      createdAt: now(),
      updatedAt: now(),
    }
  }

  async send(input: SendInput): Promise<RuntimeSessionRef> {
    void this.runTurn(input.sessionId, input.message)
    return {
      sessionId: input.sessionId,
      runtimeId: this.id,
      nativeSessionId: input.sessionId,
      state: "running",
      createdAt: now(),
      updatedAt: now(),
    }
  }

  async cancel(sessionId: SessionId): Promise<void> {
    await this.doCancel(sessionId)
    this.emit({ type: "session.ended", runtimeId: this.id, sessionId, at: now() })
  }

  subscribe(listener: (event: AgentEvent) => void): Unsubscribe {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** 第三方实现：跑一轮（产生 message.delta / session.idle 等事件） */
  protected abstract runTurn(sessionId: SessionId, message: string): Promise<void>
  protected abstract doCancel(sessionId: SessionId): Promise<void>

  protected emit(event: AgentEvent): void {
    for (const listener of this.listeners) listener(event)
  }
}
