import { EventBus } from "@agentdesk/event-bus"
import {
  AgentRegistry,
  CapabilityRegistry,
  RuntimeRegistry,
  SessionRegistry,
} from "@agentdesk/registry-core"
import type {
  AgentRuntime,
  AgentEvent,
  CreateSessionInput,
  HealthStatus,
  RuntimeId,
  RuntimeSessionRef,
  SendInput,
  SessionId,
  Unsubscribe,
} from "@agentdesk/runtime-protocol"

export interface PlatformOptions {
  readonly runtimes: readonly AgentRuntime[]
}

/**
 * AgentDesk 平台门面（M01/M03/M04 聚合）。
 * - 只依赖协议与平台包，不 import 任何 Runtime SDK（G01 / 文档 2.2）。
 * - Runtime 事件统一汇入 EventBus。
 * - 注册表提供响应式订阅。
 */
export class AgentDeskPlatform {
  readonly eventBus: EventBus
  readonly runtimeRegistry: RuntimeRegistry
  readonly agentRegistry: AgentRegistry
  readonly capabilityRegistry: CapabilityRegistry
  readonly sessionRegistry: SessionRegistry

  private readonly unsubscribes: Unsubscribe[] = []

  constructor(options: PlatformOptions) {
    this.eventBus = new EventBus()
    this.runtimeRegistry = new RuntimeRegistry()
    this.agentRegistry = new AgentRegistry()
    this.capabilityRegistry = new CapabilityRegistry()
    this.sessionRegistry = new SessionRegistry()

    for (const runtime of options.runtimes) {
      this.runtimeRegistry.register(runtime)
      this.capabilityRegistry.indexRuntime(runtime)
      this.agentRegistry.discoverNativeAgents(runtime, runtime.capabilities())
      this.unsubscribes.push(runtime.subscribe((event) => this.onRuntimeEvent(event)))
    }
  }

  /** 启动：注册全部 Runtime 并初始化 */
  async start(): Promise<void> {
    const runtimes = this.runtimeRegistry.list()
    for (const runtime of runtimes) {
      if (!this.runtimeRegistry.has(runtime.id)) continue
      await runtime.init()
      this.capabilityRegistry.indexRuntime(runtime)
    }
  }

  /** 停止：注销全部 Runtime */
  async stop(): Promise<void> {
    for (const unsubscribe of this.unsubscribes.splice(0)) unsubscribe()
    for (const runtime of this.runtimeRegistry.list()) {
      await this.runtimeRegistry.unregister(runtime.id)
      this.capabilityRegistry.removeRuntime(runtime.id)
    }
  }

  /** 按 Capability 查询可用 Runtime（功能判断优先 Capability，文档 7.1） */
  runtimesWithCapability(capability: string): AgentRuntime[] {
    return this.runtimeRegistry.findByCapability(capability)
  }

  async createSession(
    runtimeId: RuntimeId,
    input?: CreateSessionInput,
  ): Promise<RuntimeSessionRef> {
    const runtime = this.requireRuntime(runtimeId)
    const ref = await runtime.createSession(input)
    this.sessionRegistry.upsert(ref)
    return ref
  }

  async send(runtimeId: RuntimeId, input: SendInput): Promise<RuntimeSessionRef> {
    const runtime = this.requireRuntime(runtimeId)
    const ref = await runtime.send(input)
    this.sessionRegistry.upsert(ref)
    return ref
  }

  async cancel(runtimeId: RuntimeId, sessionId: SessionId): Promise<void> {
    await this.requireRuntime(runtimeId).cancel(sessionId)
  }

  async health(runtimeId?: RuntimeId): Promise<HealthStatus[]> {
    const runtimes = runtimeId
      ? [this.requireRuntime(runtimeId)]
      : this.runtimeRegistry.list()
    return Promise.all(runtimes.map((runtime) => runtime.health()))
  }

  private requireRuntime(runtimeId: RuntimeId): AgentRuntime {
    const runtime = this.runtimeRegistry.get(runtimeId)
    if (!runtime) throw new Error(`Unknown runtime: ${runtimeId}`)
    return runtime
  }

  /** Runtime 事件 → 总线 + SessionRegistry 状态同步 */
  private onRuntimeEvent(event: AgentEvent): void {
    switch (event.type) {
      case "session.created":
      case "session.resumed": {
        const existing = this.sessionRegistry.get(event.sessionId)
        this.sessionRegistry.upsert({
          sessionId: event.sessionId,
          runtimeId: event.runtimeId,
          nativeSessionId: existing?.nativeSessionId,
          state: "created",
          createdAt: existing?.createdAt ?? event.at,
          updatedAt: event.at,
          title: existing?.title,
          cwd: existing?.cwd,
        })
        break
      }
      case "session.idle": {
        const existing = this.sessionRegistry.get(event.sessionId)
        if (existing) {
          this.sessionRegistry.upsert({ ...existing, state: "idle", updatedAt: event.at })
        }
        break
      }
      case "session.error": {
        const existing = this.sessionRegistry.get(event.sessionId)
        if (existing) {
          this.sessionRegistry.upsert({
            ...existing,
            state: "error",
            error: event.error,
            updatedAt: event.at,
          })
        }
        break
      }
      case "session.ended": {
        const existing = this.sessionRegistry.get(event.sessionId)
        if (existing) {
          this.sessionRegistry.upsert({ ...existing, state: "closed", updatedAt: event.at })
        }
        break
      }
      default:
        break
    }
    this.eventBus.publish(event)
  }
}