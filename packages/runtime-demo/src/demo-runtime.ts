import {
  CAPABILITIES,
  type AgentCapabilities,
  type AgentEvent,
  type AgentRuntime,
  type CreateSessionInput,
  type HealthStatus,
  type RuntimeManifest,
  type RuntimeSessionRef,
  type SendInput,
  type SessionId,
  type Timestamp,
  type Unsubscribe,
} from "@agentdesk/runtime-protocol"

export interface DemoRuntimeOptions {
  readonly id?: string
  readonly displayName?: string
  /** 每条消息模拟耗时（毫秒） */
  readonly latencyMs?: number
  readonly failHealth?: boolean
}

function now(): Timestamp {
  return new Date().toISOString()
}

/**
 * 演示 Runtime（零依赖）。
 * 用于：G02（假 Runtime 实现协议）、G03（动态注册后可创建 session）、
 * G22（第三方 Runtime 接入不修改核心包）。
 */
export class DemoRuntime implements AgentRuntime {
  readonly id: string
  readonly manifest: RuntimeManifest

  private readonly latencyMs: number
  private readonly failHealth: boolean
  private readonly listeners = new Set<(event: AgentEvent) => void>()
  private disposed = false

  constructor(options: DemoRuntimeOptions = {}) {
    this.id = options.id ?? "demo"
    this.latencyMs = options.latencyMs ?? 5
    this.failHealth = options.failHealth ?? false
    this.manifest = {
      id: this.id,
      displayName: options.displayName ?? "Demo Runtime",
      version: "0.3.0",
      upstream: { name: "agentdesk-demo" },
      capabilities: this.capabilities(),
      supports: {
        resume: true,
        streaming: true,
        cancel: true,
        nativePermissions: false,
        nativeExtensions: false,
      },
    }
  }

  capabilities(): AgentCapabilities {
    return {
      ids: [
        CAPABILITIES.SESSION_CREATE,
        CAPABILITIES.SESSION_RESUME,
        CAPABILITIES.SESSION_STREAM,
        CAPABILITIES.SESSION_CANCEL,
        CAPABILITIES.ARTIFACT_EMIT,
      ],
    }
  }

  async init(): Promise<void> {
    this.disposed = false
  }

  async dispose(): Promise<void> {
    this.disposed = true
    this.listeners.clear()
  }

  async health(): Promise<HealthStatus> {
    if (this.failHealth) {
      return { ok: false, runtimeId: this.id, detail: "demo health failure", checkedAt: now() }
    }
    return { ok: true, runtimeId: this.id, detail: "demo ok", checkedAt: now() }
  }

  async createSession(input?: CreateSessionInput): Promise<RuntimeSessionRef> {
    this.assertAlive()
    const sessionId = `demo:${crypto.randomUUID()}`
    this.emit({
      type: "session.created",
      runtimeId: this.id,
      sessionId,
      at: now(),
    })
    const ref: RuntimeSessionRef = {
      sessionId,
      runtimeId: this.id,
      nativeSessionId: sessionId,
      state: "created",
      createdAt: now(),
      updatedAt: now(),
      title: input?.title,
      cwd: input?.cwd ?? input?.directory,
    }
    if (input?.initialMessage) {
      void this.simulateTurn(sessionId, input.initialMessage)
    }
    return ref
  }

  async resumeSession(sessionId: SessionId): Promise<RuntimeSessionRef> {
    this.assertAlive()
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
    this.assertAlive()
    void this.simulateTurn(input.sessionId, input.message)
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
    this.emit({ type: "session.ended", runtimeId: this.id, sessionId, at: now() })
  }

  subscribe(listener: (event: AgentEvent) => void): Unsubscribe {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** 模拟一次完整 turn：消息流 + tool 调用 + Artifact 产出（M04 reducer 的活数据源） */
  private async simulateTurn(sessionId: SessionId, message: string): Promise<void> {
    const messageId = `msg:${crypto.randomUUID()}`
    this.emit({ type: "message.started", runtimeId: this.id, sessionId, messageId, at: now() })

    const reply = `[demo] 已收到：${message}`
    for (const char of reply) {
      await sleep(this.latencyMs)
      this.emit({
        type: "message.delta",
        runtimeId: this.id,
        sessionId,
        messageId,
        delta: char,
        at: now(),
      })
    }

    this.emit({
      type: "tool.started",
      runtimeId: this.id,
      sessionId,
      toolName: "demo.read",
      callId: `call:${crypto.randomUUID()}`,
      args: { message },
      at: now(),
    })
    await sleep(this.latencyMs)
    this.emit({
      type: "tool.completed",
      runtimeId: this.id,
      sessionId,
      toolName: "demo.read",
      callId: `call:${crypto.randomUUID()}`,
      result: { ok: true },
      at: now(),
    })

    this.emit({
      type: "artifact.emitted",
      runtimeId: this.id,
      sessionId,
      artifact: {
        id: `artifact:${crypto.randomUUID()}`,
        kind: "markdown",
        name: "demo-note.md",
        mime: "text/markdown",
        uri: `agentdesk://demo/${sessionId}/demo-note.md`,
        createdAt: now(),
        createdBy: this.id,
        parentIds: [],
      },
      at: now(),
    })

    this.emit({
      type: "message.completed",
      runtimeId: this.id,
      sessionId,
      messageId,
      text: reply,
      at: now(),
    })
    this.emit({ type: "session.idle", runtimeId: this.id, sessionId, at: now() })
  }

  private emit(event: AgentEvent): void {
    for (const listener of this.listeners) listener(event)
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error("DemoRuntime disposed")
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}