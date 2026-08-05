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

export interface EchoRuntimeOptions {
  readonly id?: string
  readonly displayName?: string
  /** Per-character streaming latency (ms) */
  readonly latencyMs?: number
  readonly failHealth?: boolean
}

function now(): Timestamp {
  return new Date().toISOString()
}

/**
 * Echo Runtime (M04): decoupling proof for a second runtime.
 * - streaming: replies "Echo: <message>" char by char (message.delta)
 * - fake tool: echo.time (tool.started / tool.completed)
 * - permission simulation: permission.request -> permission.resolved
 *
 * Zero dependency on OpenCode / Pi / Electron / SolidJS (Gate G04).
 */
export class EchoRuntime implements AgentRuntime {
  readonly id: string
  readonly manifest: RuntimeManifest

  private readonly latencyMs: number
  private readonly failHealth: boolean
  private readonly listeners = new Set<(event: AgentEvent) => void>()
  private disposed = false

  constructor(options: EchoRuntimeOptions = {}) {
    this.id = options.id ?? "echo"
    this.latencyMs = options.latencyMs ?? 20
    this.failHealth = options.failHealth ?? false
    this.manifest = {
      id: this.id,
      displayName: options.displayName ?? "Echo Runtime",
      version: "0.3.0",
      description: "Second-runtime decoupling proof (G04)",
      icon: "echo",
      upstream: { name: "agentdesk-echo" },
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
        CAPABILITIES.PERMISSION_EVENTS,
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
      return { ok: false, runtimeId: this.id, detail: "echo health failure", checkedAt: now() }
    }
    return { ok: true, runtimeId: this.id, detail: "echo ok", checkedAt: now() }
  }

  async createSession(input?: CreateSessionInput): Promise<RuntimeSessionRef> {
    this.assertAlive()
    const sessionId = `echo:${crypto.randomUUID()}`
    this.emit({ type: "session.created", runtimeId: this.id, sessionId, at: now() })
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

  /** M04-T02/T03/T04: streaming turn + echo.time tool + permission simulation */
  private async simulateTurn(sessionId: SessionId, message: string): Promise<void> {
    const messageId = `msg:${crypto.randomUUID()}`
    this.emit({ type: "message.started", runtimeId: this.id, sessionId, messageId, at: now() })

    // M04-T04: permission request simulation
    this.emit({
      type: "permission.request",
      runtimeId: this.id,
      sessionId,
      action: "echo.reply",
      detail: { message },
      at: now(),
    })
    this.emit({
      type: "permission.resolved",
      runtimeId: this.id,
      sessionId,
      action: "echo.reply",
      decision: "allow",
      at: now(),
    })

    // M04-T02: streaming reply "Echo: <message>"
    const reply = `Echo: ${message}`
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

    // M04-T03: fake tool echo.time
    const callId = `call:${crypto.randomUUID()}`
    this.emit({
      type: "tool.started",
      runtimeId: this.id,
      sessionId,
      toolName: "echo.time",
      callId,
      args: {},
      at: now(),
    })
    await sleep(this.latencyMs)
    this.emit({
      type: "tool.completed",
      runtimeId: this.id,
      sessionId,
      toolName: "echo.time",
      callId,
      result: { now: now() },
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
    if (this.disposed) throw new Error("EchoRuntime disposed")
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}