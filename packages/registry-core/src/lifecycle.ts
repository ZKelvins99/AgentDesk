import type { AgentEvent, AgentRuntime, RuntimeId, Timestamp, Unsubscribe } from "@agentdesk/runtime-protocol"

/**
 * M03-T03 Runtime Lifecycle 状态机：
 * UNINITIALIZED → INITIALIZING → READY ⇄ BUSY（事件驱动）→ DISPOSED
 * ERROR 可由事件或外部标记进入。
 */
export type RuntimeState =
  | "uninitialized"
  | "initializing"
  | "ready"
  | "busy"
  | "error"
  | "disposed"

export interface RuntimeStateInfo {
  readonly state: RuntimeState
  readonly detail?: string
  readonly updatedAt: Timestamp
}

const now = (): Timestamp => new Date().toISOString()

export class RuntimeLifecycleManager {
  private readonly states = new Map<RuntimeId, RuntimeStateInfo>()
  private readonly unsubscribes: Unsubscribe[] = []
  private readonly subscribed = new Set<AgentRuntime>()
  private readonly runtimes?: ReadonlyMap<RuntimeId, AgentRuntime>

  constructor(runtimes?: ReadonlyMap<RuntimeId, AgentRuntime>) {
    this.runtimes = runtimes
    if (runtimes) {
      for (const [id, runtime] of runtimes) {
        this.states.set(id, { state: "uninitialized", updatedAt: now() })
        this.ensureSubscribed(runtime)
      }
    }
  }

  private ensureSubscribed(runtime: AgentRuntime): void {
    if (this.subscribed.has(runtime)) return
    this.subscribed.add(runtime)
    this.unsubscribes.push(runtime.subscribe((event) => this.onEvent(event)))
  }

  stateOf(id: RuntimeId): RuntimeStateInfo {
    return this.states.get(id) ?? { state: "uninitialized", updatedAt: now() }
  }

  setState(id: RuntimeId, state: RuntimeState, detail?: string): void {
    this.states.set(id, { state, detail, updatedAt: now() })
  }

  /** 批量启动：UNINITIALIZED → INITIALIZING → READY（失败 → ERROR） */
  async startAll(runtimes?: ReadonlyMap<RuntimeId, AgentRuntime>): Promise<void> {
    const entries = runtimes ?? this.runtimes
    if (!entries) return
    for (const [id, runtime] of entries) {
      this.ensureSubscribed(runtime)
      this.setState(id, "initializing")
      try {
        await runtime.init()
        this.setState(id, "ready")
      } catch (error) {
        this.setState(id, "error", error instanceof Error ? error.message : String(error))
      }
    }
  }

  /** 批量停止：→ DISPOSED */
  async stopAll(runtimes?: ReadonlyMap<RuntimeId, AgentRuntime>): Promise<void> {
    const entries = runtimes ?? this.runtimes
    if (!entries) return
    for (const [id, runtime] of entries) {
      try {
        await runtime.dispose()
        this.setState(id, "disposed")
      } catch (error) {
        this.setState(id, "error", error instanceof Error ? error.message : String(error))
      }
    }
    for (const unsubscribe of this.unsubscribes.splice(0)) unsubscribe()
  }

  /** M03-T04：健康状态快照（供 UI 展示 Ready / Not Installed 等） */
  healthSnapshot(runtimes: ReadonlyMap<RuntimeId, AgentRuntime>): Array<{
    runtimeId: RuntimeId
    state: RuntimeState
    ok: boolean
    detail?: string
  }> {
    const out: Array<{ runtimeId: RuntimeId; state: RuntimeState; ok: boolean; detail?: string }> = []
    for (const [id, runtime] of runtimes) {
      const info = this.stateOf(id)
      out.push({ runtimeId: id, state: info.state, ok: info.state === "ready" || info.state === "busy", detail: info.detail })
      void runtime
    }
    return out
  }

  private onEvent(event: AgentEvent): void {
    const id = event.runtimeId
    switch (event.type) {
      case "message.started":
      case "tool.started":
        this.setState(id, "busy")
        break
      case "session.idle":
      case "message.completed":
        this.setState(id, "ready")
        break
      case "session.error":
      case "error":
        this.setState(id, "error", event.type === "error" ? event.message : event.error.message)
        break
      case "session.ended":
        this.setState(id, "ready")
        break
      default:
        break
    }
  }
}