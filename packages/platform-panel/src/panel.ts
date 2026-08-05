import { AgentDeskPlatform } from "@agentdesk/platform-core"
import { RuntimeLifecycleManager } from "@agentdesk/registry-core"
import type { AgentEvent, AgentRuntime, RuntimeId } from "@agentdesk/runtime-protocol"
import { EchoRuntime } from "@agentdesk/runtime-echo"
import { OpenCodeRuntime } from "@agentdesk/runtime-opencode"
import { PiWebRuntime } from "@agentdesk/runtime-pi"

export interface AgentDeskPanelOptions {
  readonly opencodeBaseUrl?: string
  readonly opencodeDirectory?: string
  /** pi-web HTTP/SSE 服务地址（M06，Windows 兼容 Transport） */
  readonly piBaseUrl?: string
  /** extra runtimes to register (third-party decoupling demo) */
  readonly extraRuntimes?: readonly AgentRuntime[]
}

export interface RuntimeView {
  readonly id: RuntimeId
  readonly displayName: string
  readonly version: string
  readonly description?: string
  readonly state: string
  readonly ok: boolean
  readonly detail?: string
  readonly active: boolean
}

/**
 * M04-T05/T06: minimal panel facade.
 * Registers OpenCode + Pi + Echo runtimes; switching the active runtime
 * is an in-memory switch (no desktop restart needed).
 */
export class AgentDeskPanel {
  readonly platform: AgentDeskPlatform
  readonly lifecycle: RuntimeLifecycleManager

  private active: RuntimeId

  constructor(options: AgentDeskPanelOptions = {}) {
    const echo = new EchoRuntime({ latencyMs: 15 })
    const opencode = new OpenCodeRuntime({
      baseUrl: options.opencodeBaseUrl ?? "http://127.0.0.1:4096",
      ...(options.opencodeDirectory ? { directory: options.opencodeDirectory } : {}),
    })
    const pi = new PiWebRuntime({
      baseUrl: options.piBaseUrl ?? "http://127.0.0.1:30141",
      cwd: options.opencodeDirectory ?? "D:\\code_kj\\Agent工具开发\\AgentDesk\\test-workspace",
    })
    const runtimes: AgentRuntime[] = [opencode, pi, echo, ...(options.extraRuntimes ?? [])]
    this.platform = new AgentDeskPlatform({ runtimes })
    const map = new Map(runtimes.map((r) => [r.id, r]))
    this.lifecycle = new RuntimeLifecycleManager(map)
    this.active = echo.id
  }

  async start(): Promise<void> {
    const map = this.runtimeMap()
    await this.lifecycle.startAll(map)
    await this.platform.start()
  }

  async stop(): Promise<void> {
    await this.lifecycle.stopAll(this.runtimeMap())
    await this.platform.stop()
  }

  switchRuntime(id: RuntimeId): RuntimeId {
    if (!this.platform.runtimeRegistry.has(id)) {
      throw new Error(`Unknown runtime: ${id}`)
    }
    this.active = id
    return this.active
  }

  activeRuntime(): RuntimeId {
    return this.active
  }

  /** M04-T04 style health snapshot for the selector UI */
  list(): RuntimeView[] {
    const snapshot = new Map(
      this.lifecycle.healthSnapshot(this.runtimeMap()).map((s) => [s.runtimeId, s]),
    )
    return this.platform.runtimeRegistry.list().map((runtime) => {
      const info = snapshot.get(runtime.id)
      return {
        id: runtime.id,
        displayName: runtime.manifest.displayName,
        version: runtime.manifest.version,
        description: runtime.manifest.description,
        state: info?.state ?? "uninitialized",
        ok: info?.ok ?? false,
        detail: info?.detail,
        active: runtime.id === this.active,
      }
    })
  }

  async refreshHealth(): Promise<void> {
    for (const runtime of this.platform.runtimeRegistry.list()) {
      const health = await runtime.health()
      if (health.ok) {
        this.lifecycle.setState(runtime.id, "ready", health.detail)
      } else {
        this.lifecycle.setState(runtime.id, "error", health.detail ?? "not available")
      }
    }
  }

  async send(message: string, runtimeId?: RuntimeId, directory?: string, sessionId?: string): Promise<string> {
    const target = runtimeId ?? this.active
    const runtime = this.platform.runtimeRegistry.get(target)
    if (!runtime) throw new Error(`Unknown runtime: ${target}`)
    if (sessionId) {
      const ref = await this.platform.send(target, { sessionId, message })
      return ref.sessionId
    }
    const ref = await this.platform.createSession(target, {
      initialMessage: message,
      ...(directory ? { directory } : {}),
    })
    return ref.sessionId
  }

  async resume(sessionId: string, runtimeId?: RuntimeId): Promise<string> {
    const target = runtimeId ?? this.active
    const runtime = this.platform.runtimeRegistry.get(target)
    if (!runtime) throw new Error(`Unknown runtime: ${target}`)
    const ref = await runtime.resumeSession(sessionId)
    this.platform.sessionRegistry.upsert(ref)
    return ref.sessionId
  }

  /** 终止指定 runtime 的会话生成（M06-T07 Pi Cancel） */
  async cancel(sessionId: string, runtimeId?: RuntimeId): Promise<void> {
    const target = runtimeId ?? this.active
    const runtime = this.platform.runtimeRegistry.get(target)
    if (!runtime) throw new Error(`Unknown runtime: ${target}`)
    await runtime.cancel(sessionId)
  }

  /** M08: 响应原生 UI 请求（Pi Extension confirm/select/input 等） */
  async respondUi(
    sessionId: string,
    requestId: string,
    body: { value?: string; confirmed?: boolean; cancelled?: boolean },
    runtimeId?: RuntimeId,
  ): Promise<boolean> {
    const target = runtimeId ?? this.active
    const runtime = this.platform.runtimeRegistry.get(target)
    if (!runtime) throw new Error(`Unknown runtime: ${target}`)
    if (!runtime.respondUi) return false
    return runtime.respondUi({ sessionId, requestId, ...body })
  }

  subscribe(listener: (event: AgentEvent) => void): () => void {
    return this.platform.eventBus.subscribe(listener)
  }

  private runtimeMap(): Map<RuntimeId, AgentRuntime> {
    return new Map(this.platform.runtimeRegistry.list().map((r) => [r.id, r]))
  }
}
