import type {
  AgentRuntime,
  CapabilityId,
  RuntimeId,
  Unsubscribe,
} from "@agentdesk/runtime-protocol"

/** Runtime 注册表（文档第 10 节）：注册/注销/查询/生命周期/响应式订阅 */
export class RuntimeRegistry {
  private readonly runtimes = new Map<RuntimeId, AgentRuntime>()
  private readonly listeners = new Set<() => void>()

  list(): AgentRuntime[] {
    return [...this.runtimes.values()]
  }

  get(id: RuntimeId): AgentRuntime | undefined {
    return this.runtimes.get(id)
  }

  has(id: RuntimeId): boolean {
    return this.runtimes.has(id)
  }

  /** 注册并执行 init()；重复注册抛错 */
  async register(runtime: AgentRuntime): Promise<void> {
    if (this.runtimes.has(runtime.id)) {
      throw new Error(`Runtime already registered: ${runtime.id}`)
    }
    await runtime.init()
    this.runtimes.set(runtime.id, runtime)
    this.emit()
  }

  /** 注销并执行 dispose() */
  async unregister(id: RuntimeId): Promise<void> {
    const runtime = this.runtimes.get(id)
    if (!runtime) return
    await runtime.dispose()
    this.runtimes.delete(id)
    this.emit()
  }

  /** 查询具备某 Capability 的 Runtime（文档第 7 节：功能判断优先 Capability） */
  findByCapability(capability: CapabilityId): AgentRuntime[] {
    return this.list().filter((r) => r.capabilities().ids.includes(capability))
  }

  subscribe(listener: () => void): Unsubscribe {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}