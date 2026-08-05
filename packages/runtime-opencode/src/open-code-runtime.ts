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
import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk"
import { mapOpenCodeEvent, type OpenCodeRawEvent } from "./mappers.ts"

export interface OpenCodeRuntimeOptions {
  /** OpenCode server base URL，例如 http://127.0.0.1:4096 */
  readonly baseUrl: string
  /** 默认工作目录 */
  readonly directory?: string
  /** 对应 vendor/opencode commit，用于 manifest 追踪 */
  readonly upstreamCommit?: string
}

function now(): Timestamp {
  return new Date().toISOString()
}

/**
 * OpenCode Runtime 适配器（M05）。
 * 复用 @opencode-ai/sdk：health / session create / prompt / abort。
 * 事件流使用 server 的 /global/event SSE（SDK client.event() 同源）。
 * 版本与 `vendor/opencode`（commit 1882c33）对齐：@opencode-ai/sdk@1.18.11。
 */
export class OpenCodeRuntime implements AgentRuntime {
  readonly id = "opencode"
  readonly manifest: RuntimeManifest

  private readonly baseUrl: string
  private readonly directory: string | undefined
  private readonly upstreamCommit: string | undefined
  private client: OpencodeClient | undefined
  private readonly listeners = new Set<(event: AgentEvent) => void>()
  private disposed = false

  constructor(options: OpenCodeRuntimeOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "")
    this.directory = options.directory
    this.upstreamCommit = options.upstreamCommit
    this.manifest = {
      id: this.id,
      displayName: "OpenCode",
      version: "0.3.0",
      upstream: {
        name: "opencode",
        commit: this.upstreamCommit ?? "1882c33",
        npmVersion: "1.18.11",
        vendoredPath: "vendor/opencode",
      },
      capabilities: this.capabilities(),
      supports: {
        resume: true,
        streaming: true,
        cancel: true,
        nativePermissions: true,
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
        CAPABILITIES.SESSION_CANCEL,
        CAPABILITIES.TOOLS_NATIVE,
        CAPABILITIES.PERMISSION_EVENTS,
        CAPABILITIES.SKILLS_NATIVE,
        CAPABILITIES.EXTENSIONS_NATIVE,
        CAPABILITIES.CONFIG_NATIVE,
      ],
    }
  }

  async init(): Promise<void> {
    this.disposed = false
    this.client = createOpencodeClient({
      baseUrl: this.baseUrl,
      ...(this.directory ? { directory: this.directory } : {}),
    })
    // M05: attach global event stream; non-fatal when server not reachable yet
    this.attachGlobalEventStream().catch((error) => {
      this.emit({
        type: "status",
        runtimeId: this.id,
        status: "event-stream-unavailable",
        detail: error instanceof Error ? error.message : String(error),
        at: now(),
      })
    })
  }

  async dispose(): Promise<void> {
    this.disposed = true
    this.listeners.clear()
    this.client = undefined
  }

  async health(): Promise<HealthStatus> {
    try {
      const result = await this.requireClient().config.get({ query: { directory: this.directory } })
      if (result.error) {
        return { ok: false, runtimeId: this.id, detail: String(result.error), checkedAt: now() }
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
    const client = this.requireClient()
    const directory = input?.directory ?? input?.cwd ?? this.directory
    const created = await client.session.create({
      query: { directory },
      body: { title: input?.title },
    })
    if (created.error) throw new Error(String(created.error))
    const session = created.data
    if (!session) throw new Error("OpenCode session.create returned no data")

    const nativeId = String(session.id)
    const sessionId = `opencode:${nativeId}`
    this.emit({ type: "session.created", runtimeId: this.id, sessionId, at: now() })

    const ref: RuntimeSessionRef = {
      sessionId,
      runtimeId: this.id,
      nativeSessionId: nativeId,
      state: "created",
      createdAt: now(),
      updatedAt: now(),
      title: input?.title,
      cwd: directory,
    }
    if (input?.initialMessage) {
      // fire-and-forget: prompt streams back via subscribed events
      void this.send({ sessionId, message: input.initialMessage }).catch((error) => {
        this.emit({
          type: "error",
          runtimeId: this.id,
          sessionId,
          code: "opencode.prompt",
          message: error instanceof Error ? error.message : String(error),
          recoverable: true,
          at: now(),
        })
      })
    }
    return ref
  }

  async resumeSession(sessionId: SessionId): Promise<RuntimeSessionRef> {
    const client = this.requireClient()
    const nativeId = toNativeId(sessionId)
    const result = await client.session.get({ path: { id: nativeId } })
    if (result.error) throw new Error(String(result.error))
    const session = result.data
    if (!session) throw new Error("OpenCode session.get returned no data")

    const ref: RuntimeSessionRef = {
      sessionId,
      runtimeId: this.id,
      nativeSessionId: String(session.id),
      state: "created",
      createdAt: now(),
      updatedAt: now(),
      cwd: session.directory,
    }
    this.emit({ type: "session.resumed", runtimeId: this.id, sessionId, at: now() })
    return ref
  }

  async send(input: SendInput): Promise<RuntimeSessionRef> {
    const client = this.requireClient()
    const nativeId = toNativeId(input.sessionId)
    const result = await client.session.prompt({
      path: { id: nativeId },
      body: {
        parts: [{ type: "text", text: input.message }],
      },
    })
    const error = result.error
    if (error) {
      const detail = typeof error === "object" ? JSON.stringify(error) : String(error)
      throw new Error(`opencode prompt failed: ${detail}`)
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
    const client = this.requireClient()
    const result = await client.session.abort({ path: { id: toNativeId(sessionId) } })
    if (result.error) throw new Error(String(result.error))
  }

  subscribe(listener: (event: AgentEvent) => void): Unsubscribe {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** 订阅 OpenCode 全局事件流（GET /global/event，SDK client.event() 同源），映射为 AgentEvent */
  async attachGlobalEventStream(): Promise<Unsubscribe> {
    const controller = new AbortController()
    const res = await fetch(`${this.baseUrl}/global/event`, { signal: controller.signal })
    if (!res.ok) throw new Error(`opencode /global/event failed: HTTP ${res.status}`)

    void (async () => {
      try {
        for await (const raw of readSseEvents(res, controller.signal)) {
          if (controller.signal.aborted) break
          this.emit(mapOpenCodeEvent(raw, this.id))
        }
      } catch (error) {
        // server restart / connection reset: degrade gracefully instead of crashing
        if (controller.signal.aborted) return
        this.emit({
          type: "status",
          runtimeId: this.id,
          status: "event-stream-unavailable",
          detail: error instanceof Error ? error.message : String(error),
          at: now(),
        })
      }
    })()

    return () => controller.abort()
  }

  // ---- 原生元数据透传（M05-T12/T14 骨架；skills 元数据走 nativeSkills 占位） ----
  /** M05-T08 Native Settings Passthrough: passthrough OpenCode config (models/agents/permission etc.) */
  async nativeConfig(): Promise<unknown> {
    try {
      const result = await this.requireClient().config.get({ query: { directory: this.directory } })
      if (result.error) return { error: String(result.error) }
      return result.data
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  }

  async nativeAgents(): Promise<ReadonlyArray<unknown>> {
    try {
      const result = await this.requireClient().app.agents()
      return (result.data as unknown as readonly unknown[] | undefined) ?? []
    } catch {
      // server unreachable: gracefully degrade to no native agents
      return []
    }
  }

  async nativeSkills(): Promise<ReadonlyArray<unknown>> {
    // opencode app API 当前未暴露 skills 端点；预留由 server 扩展后接入
    return []
  }

  private emit(event: AgentEvent): void {
    for (const listener of this.listeners) listener(event)
  }

  private requireClient(): OpencodeClient {
    if (this.disposed || !this.client) throw new Error("OpenCodeRuntime not initialized")
    return this.client
  }
}

/** sessionId（opencode:xxx）→ 原生 id */
export function toNativeId(sessionId: SessionId): string {
  return sessionId.replace(/^opencode:/, "")
}

async function* readSseEvents(
  response: Response,
  signal?: AbortSignal,
): AsyncGenerator<OpenCodeRawEvent, void, unknown> {
  if (!response.body) throw new Error("SSE response has no body")
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  try {
    while (true) {
      if (signal?.aborted) break
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let boundary: number
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        for (const line of block.split("\n")) {
          if (!line.startsWith("data:")) continue
          try {
            yield JSON.parse(line.slice(5).trim()) as OpenCodeRawEvent
          } catch {
            // 忽略非 JSON 行
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}