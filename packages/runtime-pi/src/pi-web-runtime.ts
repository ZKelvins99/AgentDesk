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
import { mapPiWebEvent } from "./mappers.ts"
import { readSse } from "./sse.ts"

export interface PiWebRuntimeOptions {
  /** pi-web 服务地址，例如 http://127.0.0.1:3000 */
  readonly baseUrl: string
  /** 默认工作目录 */
  readonly cwd?: string
  /** pi-web 版本（vendor/pi-web） */
  readonly upstreamVersion?: string
}

interface PiWebNewSessionResponse {
  readonly success?: boolean
  readonly sessionId?: string
  readonly error?: string
}

function now(): Timestamp {
  return new Date().toISOString()
}

/**
 * Pi Runtime 适配器（M06）。
 * 默认 Transport：pi-web HTTP + SSE（Windows 兼容）。
 * macOS/Linux 可切换为 @earendil-works/pi-client unix transport（vendor/pi/packages/client）。
 *
 * 复用 API（vendor/pi-web）：
 * - POST /api/agent/new          创建会话
 * - POST /api/agent/[id]         发送命令
 * - GET  /api/agent/[id]/events  SSE 事件流
 * - GET  /api/sessions           会话列表
 */
export class PiWebRuntime implements AgentRuntime {
  readonly id = "pi"
  readonly manifest: RuntimeManifest

  private readonly baseUrl: string
  private readonly cwd: string | undefined
  private readonly listeners = new Set<(event: AgentEvent) => void>()
  private disposed = false

  constructor(options: PiWebRuntimeOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "")
    this.cwd = options.cwd
    this.manifest = {
      id: this.id,
      displayName: "Pi",
      version: "0.3.0",
      upstream: {
        name: "pi-web",
        npmVersion: options.upstreamVersion ?? "0.8.6",
        vendoredPath: "vendor/pi-web",
      },
      capabilities: this.capabilities(),
      supports: {
        resume: true,
        streaming: true,
        cancel: false,
        nativePermissions: false,
        nativeExtensions: true,
      },
    }
  }

  capabilities(): AgentCapabilities {
    return {
      ids: [
        CAPABILITIES.SESSION_CREATE,
        CAPABILITIES.SESSION_RESUME,
        CAPABILITIES.SESSION_STREAM,
        CAPABILITIES.SKILLS_NATIVE,
        CAPABILITIES.EXTENSIONS_NATIVE,
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
    try {
      const res = await fetch(`${this.baseUrl}/api/sessions`)
      if (!res.ok) {
        return { ok: false, runtimeId: this.id, detail: `HTTP ${res.status}`, checkedAt: now() }
      }
      return { ok: true, runtimeId: this.id, detail: this.baseUrl, checkedAt: now() }
    } catch (error) {
      return {
        ok: false,
        runtimeId: this.id,
        detail: error instanceof Error ? error.message : String(error),
        checkedAt: now(),
      }
    }
  }

  async createSession(input?: CreateSessionInput): Promise<RuntimeSessionRef> {
    this.assertAlive()
    const cwd = input?.cwd ?? input?.directory ?? this.cwd
    if (!cwd) throw new Error("PiWebRuntime.createSession requires cwd")

    const body: Record<string, unknown> = { cwd }
    if (input?.initialMessage) body.message = input.initialMessage

    const res = await fetch(`${this.baseUrl}/api/agent/new`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const json = (await res.json()) as PiWebNewSessionResponse
    if (!res.ok || !json.sessionId) {
      throw new Error(json.error ?? `pi-web /api/agent/new failed: HTTP ${res.status}`)
    }

    const nativeId = json.sessionId
    const sessionId = `pi:${nativeId}`
    this.emit({ type: "session.created", runtimeId: this.id, sessionId, at: now() })
    return {
      sessionId,
      runtimeId: this.id,
      nativeSessionId: nativeId,
      state: "created",
      createdAt: now(),
      updatedAt: now(),
      cwd,
      title: input?.title,
    }
  }

  async resumeSession(sessionId: SessionId): Promise<RuntimeSessionRef> {
    this.assertAlive()
    this.emit({ type: "session.resumed", runtimeId: this.id, sessionId, at: now() })
    return {
      sessionId,
      runtimeId: this.id,
      nativeSessionId: toNativeId(sessionId),
      state: "created",
      createdAt: now(),
      updatedAt: now(),
    }
  }

  async send(input: SendInput): Promise<RuntimeSessionRef> {
    this.assertAlive()
    const nativeId = toNativeId(input.sessionId)
    const res = await fetch(`${this.baseUrl}/api/agent/${encodeURIComponent(nativeId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "user_message", message: input.message }),
    })
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(json.error ?? `pi-web send failed: HTTP ${res.status}`)
    }
    return {
      sessionId: input.sessionId,
      runtimeId: this.id,
      nativeSessionId: nativeId,
      state: "running",
      createdAt: now(),
      updatedAt: now(),
    }
  }

  async cancel(sessionId: SessionId): Promise<void> {
    // pi-web 当前无独立 cancel 端点；透传原生事件（M06-T09 待实现）
    this.emit({ type: "session.ended", runtimeId: this.id, sessionId, at: now() })
  }

  subscribe(listener: (event: AgentEvent) => void): Unsubscribe {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** 订阅 pi-web SSE 事件流（GET /api/agent/[id]/events） */
  async attachSessionEventStream(sessionId: SessionId): Promise<Unsubscribe> {
    this.assertAlive()
    const nativeId = toNativeId(sessionId)
    const controller = new AbortController()
    const res = await fetch(
      `${this.baseUrl}/api/agent/${encodeURIComponent(nativeId)}/events`,
      { signal: controller.signal },
    )
    if (!res.ok) throw new Error(`pi-web events failed: HTTP ${res.status}`)

    void (async () => {
      for await (const sse of readSse(res, controller.signal)) {
        if (controller.signal.aborted) break
        try {
          const raw = JSON.parse(sse.data) as Record<string, unknown>
          const event = mapPiWebEvent(raw as never, this.id, sessionId)
          if (event) this.emit(event)
        } catch {
          // 忽略无法解析的 SSE 数据
        }
      }
    })()

    return () => controller.abort()
  }

  private emit(event: AgentEvent): void {
    for (const listener of this.listeners) listener(event)
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error("PiWebRuntime disposed")
  }
}

/** sessionId（pi:xxx）→ 原生 id */
export function toNativeId(sessionId: SessionId): string {
  return sessionId.replace(/^pi:/, "")
}