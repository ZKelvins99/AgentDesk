import type { AgentRuntime, RuntimeId } from "@agentdesk/runtime-protocol"

/**
 * M03-T02 Runtime Factory：
 * 允许 Runtime 延迟实例化（注册 factory，启动/首次使用时才 new）。
 * 避免程序启动时立刻拉起所有 Runtime。
 */
export type RuntimeFactory = () => AgentRuntime | Promise<AgentRuntime>

export interface RuntimeFactoryEntry {
  readonly id: RuntimeId
  readonly factory: RuntimeFactory
  readonly description?: string
}

export class RuntimeFactoryRegistry {
  private readonly factories = new Map<RuntimeId, RuntimeFactoryEntry>()
  private readonly instances = new Map<RuntimeId, AgentRuntime>()

  register(id: RuntimeId, factory: RuntimeFactory, description?: string): void {
    if (this.factories.has(id)) {
      throw new Error(`Runtime factory already registered: ${id}`)
    }
    this.factories.set(id, { id, factory, description })
  }

  unregister(id: RuntimeId): void {
    this.factories.delete(id)
    this.instances.delete(id)
  }

  has(id: RuntimeId): boolean {
    return this.factories.has(id)
  }

  listFactories(): RuntimeFactoryEntry[] {
    return [...this.factories.values()]
  }

  /** 延迟实例化（幂等：已实例化则复用） */
  async instantiate(id: RuntimeId): Promise<AgentRuntime> {
    const cached = this.instances.get(id)
    if (cached) return cached
    const entry = this.factories.get(id)
    if (!entry) throw new Error(`Unknown runtime factory: ${id}`)
    const runtime = await entry.factory()
    this.instances.set(id, runtime)
    return runtime
  }
}